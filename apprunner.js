/*C2B Backend Server*/
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

/*Allow cross origin requests*/
app.use(function(req,res,next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

/* AppUI Setup */
/** 1. Serve main HTML file */
app.get("/", function(req, res) {
  res.sendFile(__dirname + "/views/index.html");
});

/** 2. Serve static assets  */
app.use(express.static(__dirname + "/public"));

/* @GlobalParam localCache -- [{"status": "", "requestId":"", "resultCode": ""}]
  ** For interfacing with DOM: AjaxCall->Endpoint->ReturnLocalCache where RequestId
      1. Prevent DOM From invoking dbCalls Directly
      2. Avoid Manipulating DOM Directly from Node.js Server.
      3. Use cache entries to update MongoDB Collections.
*/
let localCache = [];
/*
  @HelperFn updateLocalCache(requestId, status)
  ** Update LocalCache For DOM References & MongoDB Collection updates. Used to update localcache entries with
  the callBackURL results.
  * A corresponding entry is added to a transactionDB for each Object updated in this localCache.
  * For efficiency, the Object referring to a transaction is deleted from the LocalCache at the end of the TransactionCycle.

  *The localcache has an object entry - {"requestId": "", "status": ""}  - for each transaction that ...
  * ...is updated when the /process endpoint is invoked.
  *Update the localCache entry for a specific json object and set status to either Completed | Cancelled | Failed
*/
function updateLocalCache(requestID, status) {
  for(let entry of localCache) {
    if(entry.requestID == requestID) {
      entry.status = status;
      entry.callBackStatus = true;
      entry.timeStamp = Utils.getTimeStamp();
      console.log(`LocalCache Update ${JSON.stringify(localCache)} @Test2[From CallBackURL]`);
      return entry;
    }
  }
}
/*The /process Transaction is to be finished in ~54s.
 **This fn will update the db collection for transactions with unresolved callBacks. We can call this fn 
   10s after transaction Completion [60s] making the flushAndUpdate independent of endpoint traffic, rather 
   than the original idea of having the flushAndUpdateDB() fn called for each transaction.
 **With increased user traffic, the localCache can grow to a considerable size in a short span of time. By including 
   the flushAndUpdateDB() fn, we empty the untracked transactions in our localCache into our db. 
   This prevents the localCache from building up to undesirable sizes.
 */
function flushAndUpdate() {
  if(localCache.length>0) {
    localCache.filter((entry)=> {
      if(!(entry.callBackStatus)) {
        let data = entry;
        data.resultCode = "Unkown";
        data.status = "Unresolved";
        data.resultDesc = "[Error] Unresolved Callback";

        mongo.connect(process.env.MONGO_URI, {useNewUrlParser: true}, (err,db)=>{
          if(err) {
            console.log("DBConnectionERR " + err);
            process.exit(0);
          }
          let db0 = db.db(process.env.DB);
          let collection = db0.collection(process.env.COLLECTION);
          collection.insertOne(data, (err, result) => {
            if(err) {
              console.log(`@Flush&UpdateInsertErr: ${err}`);
              process.exit(0);
            }
          });
        });
      };
      //The filter fn Deletes entries where callBackStatus == false;
      return entry.callBackStatus == true;
    });
  }
}
/* Preserve code above this comment */
/*Custom code here*/



/*Preserve code below this comment*/
/*Listener*/
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
