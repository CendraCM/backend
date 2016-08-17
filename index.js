var express = require('express');
var app = express();
var config = require('/etc/service-config/service');
var mongo = require('mongo-factory');
var session = require('express-session');
var parser = require('body-parser');
//var RedisStore = require('connect-redis');
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
    });
  }
};

mongo.getConnection(url)
.then(function(db) {
  app.get('/test', function(req, res, next) {
    res.send('Ok');
  });

  app.use(parser.json({limit: config.maxSize||'50mb'}));
  app.use(parser.urlencoded({extended: true, limit: config.maxSize||'50mb'}));
  app.use(function(req, res, next) {
    console.log(req.method+' '+req.originalUrl);
    next();
  });

  /*app.use(session({
      store: new RedisStore(config.redis),
      secret: '329cba3dabed5031b626ea76d59e33a6'
  }));*/

  var api = express.Router();

  api.use(function(req, res, next) {
    var token = req.query.access_token||req.body.access_token;
    if(!token && req.headers.authorization) {
      var auth = req.headers.authorization.split(' ');
      if(auth[0] == 'Bearer') {
        token = auth[1];
      }
    }
    if(['POST', 'PUT', 'DELETE'].indexOf(req.method)!==-1 && !token) return res.status(401).send("This action requires authentication token");
    if(!token) return next();
    var tokeninfo = function(req, res, next) {
      request({url: config.tokeninfo, auth: {username: config.oauth2.key, password: config.oauth2.secret}, json: {access_token: token}}, function(error, headers, body) {
        try {
          req.token = JSON.parse(body);
          if(!req.token.sub && config.userinfo) {
            userinfo(req, res, next);
          }
        } catch(e) {
          req.token = false;
        }
        next();
      });
    };
    var userinfo = function(req, res, next) {
      request({url: config.userinfo, auth: {bearer: token}}, function(error, headers, body) {
        try {
          user = JSON.parse(body);
          if(user.sub) {
            req.token.sub = user.sub;
          }
        } catch(e) {
          req.token = false;
        }
        next();
      });
    };
    if(config.tokeninfo) {
      return tokeninfo(req, res, next);
    }
    if(config.userinfo) {
      return userinfo(req, res, next);
    }
    return res.status(500).send("No authentication endpoint configured");
  });

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
  console.log('Could not connect to Mongo '+url+' '+err);
  process.exit(1);
});
