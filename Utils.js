const https = require("https");

module.exports = {
  tiny: function(string) {
    if(typeof(string)!=="string") throw new TypeError("Tiny only accepts Strings");
    return string.replace(/\s/g,"");
  },
  
  getTimeStamp: function() {
    function parseDate(e) { return (e < 10) ? "0" + e : e; }
    var _date = new Date();
    var currentTime = 
        new Date(_date.toLocaleString("en-us", {timeZone: "Africa/Nairobi"}));
    var month = parseDate(currentTime.getMonth() + 1);
    var date = parseDate(currentTime.getDate());
    var hour = parseDate(currentTime.getHours());
    var minutes = parseDate(currentTime.getMinutes());
    var seconds = parseDate(currentTime.getSeconds());
    return currentTime.getFullYear() + "" + month + "" + date + "" + 
        hour + "" + minutes + "" + seconds;
  },
  
  getAT: function(){
    var getOptions = {
      host: process.env.AT_HOST,
      path: process.env.AT_PATH,
      method: "GET",
      headers: {
        "Authorization": "Basic " + Buffer.from(process.env.DORA
          + ":" + process.env.BUCK).toString("base64"),
          "Accept":"application/json"
      }
    }

    return new Promise(function(resolve, reject) {
      https.request(getOptions, function(res) {
        res.setEncoding("utf-8");
        res.on("data", function(d) {
          resolve(JSON.parse(d));
        });
        res.on("error", function(e) {
          reject(e);
        });
      }).end();
    });
  },
  
  processRequest: function(amount, mssidn) {
    var postBody = JSON.stringify({
      "BusinessShortCode": process.env.SC,
      "Password": Buffer.from(process.env.SC + process.env.PK + module.exports.getTimeStamp()).toString("base64"),
      "Timestamp": module.exports.getTimeStamp(),
      "TransactionType": process.env.TA_T,
      "Amount": amount,
      "PartyA": mssidn,
      "PartyB": process.env.SC,
      "PhoneNumber": mssidn,
      "CallBackURL": process.env.C_URL,
      "AccountReference": process.env.ARF,
      "TransactionDesc": process.env.ARF,
    });
    var aTPromise = module.exports.getAT();
    
    return aTPromise.then(function(rObj) {
      return rObj[process.env.SESSION_AT];
    }, function(err) {
      return "";
    }).then(function(_at) {
      var postOptions = {
          host: process.env.AT_HOST,
          path: process.env.PR_PATH,
          method: "POST",
          headers: {
            "Authorization": "Bearer " + _at,
            'Content-Type' : 'application/json',
            'Content-Length' : Buffer.byteLength(postBody, 'utf8')
          }        
      }
      return new Promise(function(resolve, reject) {
        var post = https.request(postOptions, function(res) {
          res.setEncoding("utf-8");
          res.on("data", function(d) {
            resolve(JSON.parse(d));
          });
          res.on("error", function(e) {
            reject(e);
          });
        });
        post.write(postBody);
        post.end();
      });
    });
  }
  
};
