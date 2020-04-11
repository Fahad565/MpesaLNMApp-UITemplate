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
/* Preserve code above this comment */

/*Custom code here*/

/*Preserve code below this comment*/

/*Listener*/
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
