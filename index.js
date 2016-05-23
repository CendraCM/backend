var express = require('express');
var app = express();
var config = require('/etc/service-config/service');
var mongo = require('mongo-factory');
var session = require('express-session');
var parser = require('body-parser');
var RedisStore = require('connect-redis');
var fs = require('fs');
var url = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;
if(process.env.NODE_ENV == 'ci-testing') {
  url += '-ci-testing';
}

module.exports = {
  fns: [],
  started: false,
  onLoaded: function(fn) {
    if(this.started) fn(this.app, this.db);
    else this.fns.push(fn);
  },
  loaded: function(app, db) {
    this.app = app;
    this.db = db;
    this.started = true;
    this.fns.forEach(function(fn) {
      //process.nextTick(function(){
        fn(app, db);
      //})
    })
  }
};

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

  app.use(session({
      store: new RedisStore(config.redis),
      secret: '329cba3dabed5031b626ea76d59e33a6'
  }));

  var api = express.Router();

  api.use(function(req, res, next) {
    if(['POST', 'PUT', 'DELETE'].indexOf(req.method)!==-1 && !req.session.user && !req.url.match(/.*\/login$/)) return res.status(401).send("This action requires authentication");
    next();
  })

  api.use('/v1', require('./v1')());

  app.use('/api', api);

  app.use(function(err, req, res, next) {
    if(!err.status) return res.status(500).send(err.message||err);
    res.status(err.status).send(err.message);
  });

  if(process.env.NODE_ENV != 'ci-testing') {
    app.listen(80);
  } else {
      module.exports.loaded(app, db);
  }
})
.catch(function(err) {
  console.log('Could not connect to Mongo');
  process.exit(1);
});
