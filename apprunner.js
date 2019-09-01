// init project
const prettyjson = require('prettyjson');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require("mongoose");
const mongo = require("mongodb");
const https = require("https");
const Utils = require("./Utils.js");

console.log(Utils.tiny("So much space!"));

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

var localCache = [];
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
function updateLocalCache(requestId, status) {
  for(var i=0; i<localCache.length; i++) {
    if(localCache[i]["requestId"] == requestId) {
      localCache[i]["status"] = status;
      localCache[i]["callBackStatus"] = true;
      console.log("LocalCache Update " + localCache + " @Test2[CallBackURL]");
      break;
    }
  }
}


/*This is where all the magic happens*/
app.post("/process", function(req, res) {
  /*Obtain request payload from app UI*/
  var amount = req.body.amnt;
  var mssidn = req.body.number;
  /*End*/
  
  //ajaxCallResponseMsg
  var msg = {
    "status": "",
    "requestId": ""
  }
  
  //localCacheMsg
  var cacheUpdate = {
    "requestId": "",
    "callBackStatus": "",
    "status": ""
  }
  
  /*Invoke Payment API*/
  var postRes = Utils.processRequest(amount, mssidn);
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
    if(typeof(rObj.ResponseCode)!== "undefined") {
      //Start countdown immediately [?] 
      /*
       Return defaultTimeout with response?
       Return timestamp: 
      */
      cacheUpdate.requestId = rObj.MerchantRequestID;
      cacheUpdate.status = "PendingCompletion";
      cacheUpdate.callBackStatus = false;
      localCache.push(cacheUpdate);
      console.log("Updated Local Cache: " + localCache + "@Test1[Initial Call]");
      
      msg.status="success";
      msg.requestId=rObj.MerchantRequestID;
      res.json(msg);
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
  
  var requestId = req.body.Body.stkCallback.MerchantRequestID;
  var resultCode = req.body.Body.stkCallback.ResultCode;
  var status = resultCode == "1032" ? "Cancelled" : (resultCode == "0" ? "Success" : "Failed");
  var resultDesc = req.body.Body.stkCallback.ResultCode;
  
  updateLocalCache(requestId, status);
  console.log(requestId + ", " + resultCode + ", " + status + ", " + resultDesc);
  
  /*Persist Processing Results to a MongoDB collection*/
  mongo.connect(process.env.MONGO_URI, {useNewUrlParser: true}, (err, db) => {
    if(err) {      
      /*Logger*/
      console.log("DBConnectionERR " + err);
      /*End of Logger*/
      /*Recursive Function Call?*/
      process.exit(0);
    }
    
    let data = { "requestId": requestId, "resultCode": resultCode, "status": status, "resultDesc": resultDesc };
    
    var db0 = db.db(process.env.DB);
    var collection = db0.collection(process.env.COLLECTION);
    collection.insertOne(data, (err, result) => {
      if(err) {
        /*Logger*/
        console.log("InsertErr: " + err);
        /*End of Logger*/
        
        process.exit(0);
      }
      console.log("DBInsertOperationComplete: " + JSON.stringify(data) + "@Test3");
      console.log(Utils.getTimeStamp() + " @StopTime");
    });
  });
  let message = {"ResponseCode": "0", "ResponseDesc": "success"};
  res.json(message);
  
});

app.post("/queryTransaction", (req,res)=> {
  console.log("Query Transaction");   
  console.log(req.body);
});

app.post("/queryTransactionTimeout", (req,res)=> {
  console.log("Transaction Query Timeout");
  console.log(req.body);
});

/*LocalCache Listener*/
app.post("/listener", function(req,res) {
  var requestId = req.body.requestId;
  for(var i=0; i<localCache.length; i++) {
    if(localCache[i]["requestId"] == requestId) {
      console.log(localCache);
      //console.log(localCache[i]["requestId"]);
      res.json(localCache[i]);
    }
  }
});

async function init() {
  var postRes = Utils.processRequest(process.env.TAMOUNT,process.env.TMSSIDN);
  postRes.then(function(rObj) {
    console.log("Processed Request Successfuly @Test X");
    console.log(rObj);
    console.log(Utils.getTimeStamp() + " @StartTime");
  });
};

//init();

/*Listener*/
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
