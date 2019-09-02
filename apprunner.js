// init project
const prettyjson = require('prettyjson');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require("mongoose");
const mongo = require("mongodb");
const https = require("https");
const Utils = require("./Utils.js");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

const options = {
  noColor: true
};

/** 3) Serve an HTML file */
app.get("/", function(req, res) {
  res.sendFile(__dirname + "/views/index.html");
});

/** 4) Serve static assets  */
app.use(express.static(__dirname + "/public"));

let localCache = [];
/*For interfacing with DOM: AjaxCall->Endpoint->ReturnLocalCache where RequestId*/
/*[{"status": "", "requestId":"", "resultCode": ""}]*/
/**1. Prevent DOM From invoking dbCalls Directly
  *2. Avoid Manipulating DOM Directly from Node.js Server.
*/

/**CacheUpdate: Update LocalCache For DOM References. This is a temporary buffer for holding the callbackURL results.
  * A corresponding entry is added to a transactionDB for each Object updated in this localCache.
  * For efficiency, the Object referring to a transaction is deleted from the LocalCache at the end of the TransactionCycle.
  *[GlobalVariable] var localCache = [];
  *The localcache has an object entry - {"requestId": "", "status": ""}  - for each transaction that ...
  * ...is updated when the /process endpoint is invoked.
  *Update the localCache entry for a specific json object and set status to either Completed | Cancelled | Failed
*/
function updateLocalCache(requestID, status) {
  for(let entry of localCache) {
    if(entry.requestID == requestID) {
      entry.status = status;
      entry.callBackStatus = true;
      console.log(`LocalCache Update ${JSON.stringify(localCache)} @Test2[From CallBackURL]`);
      break;
    }
  }
}

/*flushCacheAndUpdateDB
  * Loop  through localCache;
*/
function flushAndUpdate() {
  if(localCache.length>0) {
    localCache.filter((entry)=> {
      console.log(`@TestX: CallBackStatusCheck - callBackStatus equals false ? ${entry.callBackStatus == false}`);
      console.log(`Initial localCache = ${JSON.stringify(localCache)}, Current Index = ${localCache.indexOf(entry)}, Current Element = ${JSON.stringify(entry)}`);
      if(!(entry.callBackStatus)) {
        let data = {
          "requestID": entry.requestID, 
          "mssidn": entry.mssidn, 
          "resultCode": "Unkown", 
          "status": "Unresolved", 
          "resultDesc": "[Error] Unresolved Callback"
        }
        mongo.connect(process.env.MONGO_URI, {useNewUrlParser: true}, (err,db)=>{
          if(err) {
            console.log("DBConnectionERR " + err);
            /* DBOperationFail
            *Don't delete the transaction entry, will be updated within next flushAndUpdateDB() fn call
            */
            process.exit(0);
          }
          /*Else*/
          let db0 = db.db(process.env.DB);
          let collection = db0.collection(process.env.COLLECTION);
          collection.insertOne(data, (err, result) => {
            if(err) {
              /*Logger*/
              console.log(`UnresolvedOperationsInsertErr: ${err}`);
              /*End of Logger*/
              process.exit(0);
            }
            /*Delete Current Entry*/
            console.log(`Updated localCache = ${JSON.stringify(localCache)}`);
          });
        });
      };
      return entry.callBackStatus == true;
    });
  }
}

/*This is where all the magic happens*/
app.post("/process", function(req, res) {
  /*Obtain request payload from app UI*/
  let amount = req.body.amnt;
  let mssidn = req.body.number;
  /*End*/
  
  //ajaxCallResponseMsg
  let msg = {
    "status": "",
    "requestID": ""
  }
  
  //localCacheMsg
  let cacheUpdate = {
    "requestID": "",
    "mssidn": "",
    "callBackStatus": "",
    "status": ""
  }
  
  /*Invoke Payment API restCall fn which returns a Promise*/
  let postRes = Utils.processRequest(amount, mssidn);
  postRes.then(function(rObj) {
    /*Logger*/
    console.log("Processing Response");
    console.log(rObj);
    console.log(Utils.getTimeStamp() + " @StartTime");
    /*End Logger*/
    
    /**Parse ResponseMsg From RESTCall
      *Update LocalCache Object
      *Return JSON Response to Client
    */
    if(typeof(rObj.ResponseCode)!== "undefined" && rObj.ResponseCode == "0") {
      let requestID = rObj.MerchantRequestID;
      
      cacheUpdate.requestID = requestID;
      cacheUpdate.mssidn = mssidn;
      cacheUpdate.callBackStatus = false;
      cacheUpdate.status = "PendingCompletion";
      
      localCache.push(cacheUpdate);
      console.log(`Updated Local Cache: ${JSON.stringify(localCache)} + @Test1[Initial Call]`);
      
      msg.status="success";
      msg.requestID=rObj.MerchantRequestID;
      res.json(msg);
      
      /*Transaction is to be finished in 50s.
       *Update db record add transactions with unresolved callBacks using the flushAndUpdateDb 10s after transaction Completion [60s].
       * The timeout fn will make flushAndUpdate inddependent on endpoint traffic, rather than the original idea
        of having the flushAndUpdateDB() fn called for each transaction.
       * With increased user traffic, the localCache can grow to a considerable size in a short span of time.
        by including the flushAndUpdateDB() fn, we empty the untracked transactions in our localCache into our db. 
        This prevents the localCache from building up to undesirable sizes.
      */
      setTimeout(function() {
        flushAndUpdate();
      }, 60000)
      
    } else { 
      msg.status="error"
      res.json(msg);
    }
  });
});

/*CallBack URL*/
app.post("/hooks/confirm", function(req,res) {
  console.log("@Hook Request Payload");
  console.log(req.body);  
  
  let requestID = req.body.Body.stkCallback.MerchantRequestID;
  let mssidn;
  
  for(let entry of localCache) {
    if(entry.requestID = requestID) {
      mssidn = entry.mssidn;
      break;
    }
  }
  
  let resultCode = req.body.Body.stkCallback.ResultCode;
  let status = resultCode == "1032" ? "Cancelled" : (resultCode == "0" ? "Success" : "Failed");
  let resultDesc = req.body.Body.stkCallback.ResultDesc;
  
  //updateLocalCache sets callBackStatus to true
  updateLocalCache(requestID, status);
  console.log(`requestID = ${requestID}, resultCode = ${resultCode}, status = ${status}, resultDesc = ${resultDesc}`);
  
  /*Persist Processing Results to a MongoDB collection*/
  mongo.connect(process.env.MONGO_URI, {useNewUrlParser: true}, (err, db) => {
    if(err) {      
      /*Logger*/
      console.log("DBConnectionERR " + err);
      /*End of Logger*/
      /*Recursive Function Call?*/
      process.exit(0);
    }
    
    let data = { "requestID": requestID, 
                "mssidn": mssidn,  
                "resultCode": resultCode, 
                "status": status, 
                "resultDesc": resultDesc };
    
    let db0 = db.db(process.env.DB);
    let collection = db0.collection(process.env.COLLECTION);
    collection.insertOne(data, (err, result) => {
      if(err) {
        /*Logger*/
        console.log("InsertErr: " + err);
        /*End of Logger*/
        process.exit(0);
      }
      console.log(`DBInsertOperationComplete ${JSON.stringify(data)} @Test3`);
      console.log(`${Utils.getTimeStamp()} @StopTime`);
    });
  });
  let message = {"ResponseCode": "0", "ResponseDesc": "success"};
  res.json(message);
});

/*LocalCache Listener for Updating appUI*/
app.post("/listener", function(req,res) {
  let requestID = req.body.requestID;
  console.log(`${requestID} from appUI`);
  for(let entry of localCache) {
    console.log(`${JSON.stringify(entry)} from listenerLoop`);
    if(entry.requestID == requestID) {
      //if match is found, check callbackstatus
      if(entry.callBackStatus) {
        console.log(`Found match@ ${JSON.stringify(entry)} with resolved callBack`);
        res.json(entry);
        localCache = localCache.filter((entry)=>{
          //remove the transactionObject because it's been resolved
          return entry.requestID != requestID;
        });
        console.log(`localCache updated from /listener : ${JSON.stringify(localCache)}`);
      } else {
        //return entry only
        console.log(`Found match@ ${JSON.stringify(entry)} with Unresolved Callback`);
        res.json(entry);
      }
    }
  }
});

/*Listener*/
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
