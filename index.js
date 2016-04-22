var express = require('express');
var app = express();
var config = require('/etc/nodejs-config/cendraCM').backend;
var mongo = require('mongo-factory');
var session = require('express-session');
var parser = require('body-parser');
var fs = require('fs');
var url = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;
if(process.env.NODE_ENV == 'ci-testing') {
  url += '-ci-testing';
}
mongo.getConnection(url)
.then(function(db) {
  app.get('/test', function(req, res, next) {
    res.send('Ok');
  });

  app.use(parser.json());
  app.use(parser.urlencoded({extended: true}));
  app.use(function(req, res, next) {
    console.log(req.method+' '+req.originalUrl);
    next();
  });

  var api = express.Router();

  api.use(function(req, res, next) {
    //Autenticar
    next();
  })

  api.use('/v1', require('./v1')());

  app.use('/api', api);

  app.use(function(err, req, res, next) {
    if(!err.status) return res.status(500).send(err.message||err);
    res.status(err.status).send(err.message);
  });

  if(process.env.NODE_ENV != 'ci-testing') {
    app.listen('/run/service/service.sock');
    process.on('exit', function(){
      try {
        fs.unlinkSync('/run/service/service.sock');
      }catch(e) {

      }
    });
  } else {
    module.exports = {app: app, db: db};
  }
})
.catch(function(err) {
  console.log('Could not connect to Mongo');
  process.exit();
});
