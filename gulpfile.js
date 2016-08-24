var gulp = require('gulp');
var package = require('./package');
var httpProxy = require('http-proxy');
var Docker = require('dockerode');
var config = require('./gulpconf');
var docker = new Docker(config.docker);
var tar = require('gulp-tar');
var vfs = require('vinyl-fs');
var net = require('net');
var path = require('path');

if(config.project.fe) {
  var inject = require('gulp-inject');
  var wiredep = require('gulp-wiredep');
  var angularFilesort = require('gulp-angular-filesort');
  var concat = require('gulp-concat');
  var sass = require('gulp-sass');
  var browser = require('browser-sync').create();
  var map = require('gulp-map');

  var temp = function temp() {
    return gulp.src(config.project.fe.index).pipe(gulp.dest('.tmp/'));
  };

  gulp.task('inject', ['sass'], function injectTask() {
    var target = temp();
    // It's not necessary to read the files (will speed up things), we're only after their paths:
    var js = gulp.src(config.project.fe.js||[]).pipe(angularFilesort()).pipe(map(function(file) {
      var indexPath = path.resolve(__dirname, path.dirname(config.project.fe.index));
      var relative = path.relative(indexPath, file.path);
      file.base = indexPath;
      file.path = path.join(__dirname, relative);
      return file;
    }));

    var css = gulp.src(config.project.fe.css||[], {read: false}).pipe(map(function(file) {
      var indexPath = path.resolve(__dirname, path.dirname(config.project.fe.index));
      var relative = path.relative(indexPath, file.path);
      file.base = indexPath;
      file.path = path.join(__dirname, relative);
      return file;
    }));

    return target
      .pipe(inject(js))
      .pipe(inject(css))
      .pipe(gulp.dest(path.dirname(config.project.fe.index)));
  });

  gulp.task('bower', function bowerTask() {
    return temp()
      .pipe(wiredep({ignorePath: '..', onError: function(err) { console.log(err); }}))
      .pipe(gulp.dest(path.dirname(config.project.fe.index)));
  });

  gulp.task('sass', function(done) {
    if(!config.project.fe.scss) return done();
    return gulp.src(config.project.fe.scss.src)
        .pipe(concat('angularProject.scss'))
        .pipe(sass({outputStyle: 'expanded'}))
        .pipe(gulp.dest(config.project.fe.scss.dest));
  });

  gulp.task('proxy', ['watch'], function serveTask(done) {
    browser.init({
      proxy: {
        target: 'http://localhost',
        ws: true,
        proxyReq: [
            function (proxyReq) {
                proxyReq.setHeader('Host', package.name+'.unc.edu.ar');
            }
        ]
      },
      errHandler: function(error) {
        done(error);
      }
    });
  });

  gulp.task('reload', function reloadTask() {
    browser.reload();
  });

  gulp.task('serve', ['docker', 'proxy', 'watch']);
  gulp.task('debug', ['inspect', 'proxy', 'watch']);

} else {

  gulp.task('bower', function(done) {done();});
  gulp.task('inject', function(done) {done();});

}

gulp.task('default', ['docker']);

gulp.task('tar', function() {
  return vfs.src(config.project.tar, {base: '.'}).pipe(tar(package.name+'.tar')).pipe(gulp.dest('/tmp/'));
});

gulp.task('docker:image', ['tar'], function dockerBuildTask(done) {
  docker.buildImage('/tmp/'+package.name+'.tar', {
    t: package.name+':'+package.version
  }, function(error, stream) {
    if(error) return done(error);
    docker.modem.demuxStream(stream, process.stdout, process.stderr);
    stream.on('end', done);
  });
});

function dockerCreateTask(params, done) {
  var container = docker.getContainer(package.name);
  container.remove({force: true}, function(err, data) {
    docker.createContainer(params, function(error, container) {
      if(error) return done(error);
      container.start(function(error, data) {
        done();
      });
    });
  });
}

gulp.task('docker', ['docker:image'], function(done) {
  var volumes = {};
  var binds = [];
  var mkv = function(obj) {
    if(obj.volumes) {
      for(var i in obj.volumes) {
        volumes[i] = {};
        binds.push(path.resolve(__dirname, obj.volumes[i])+':'+i);
      }
    }
  };
  var devObj = {
    volumes: {
      "/usr/lib/node_modules": "/usr/lib/node_modules"
    }
  };
  var bowerShare = process.env.HOME+"/.local/share/bower";
  devObj.volumes[bowerShare] = bowerShare;
  mkv(devObj);
  mkv(config);
  mkv(config.project);

  dockerCreateTask({
    Image: package.name+':'+package.version,
    name: package.name,
    Volumes: volumes,
    HostConfig: {
      Binds: binds,
      Links: config.links
    }
  }, done);
});

gulp.task('docker:debug', ['docker:image'], function (done) {
  var volumes = {};
  var binds = [];
  var mkv = function(obj) {
    if(obj.volumes) {
      for(var i in obj.volumes) {
        volumes[i] = {};
        binds.push(path.resolve(__dirname, obj.volumes[i])+':'+i);
      }
    }
  };
  var devObj = {
    volumes: {
      "/usr/lib/node_modules": "/usr/lib/node_modules"
    }
  };
  var bowerShare = process.env.HOME+"/.local/share/bower";
  devObj.volumes[bowerShare] = bowerShare;
  mkv(devObj);
  mkv(config);
  mkv(config.project);
  dockerCreateTask({
    Image: package.name+':'+package.version,
    name: package.name,
    Volumes: volumes,
    HostConfig: {
      Binds: binds,
      Links: config.links
    },
    Entrypoint: ["/opt/project/entrypoint.sh", "debug"]
  }, done);
});

gulp.task('inspect', ['docker:debug', 'watch'], function serveTask() {
  var portrange = 45032;

  function getPort (cb) {
    var port = portrange;
    portrange += 1;

    var server = net.createServer();
    server.listen(port, function (err) {
      server.once('close', function () {
        cb(port);
      });
      server.close();
    });
    server.on('error', function (err) {
      getPort(cb);
    });
  }

  getPort(function(port) {
    httpProxy.createServer({target: 'http://localhost', ws:true, headers: {'Host': package.name+'__8080__.unc.edu.ar'}}).listen(port);
    console.log("node inspector listening on http://localhost:"+port+'/?port=5858');
  });

});

gulp.task('watch', ['bower', 'inject'], function(){
  var bkfiles = (config.project.bk.js||[]).concat(['/etc/nodejs-config/'+package.name+'.json']);
  gulp.watch(bkfiles, ['docker:restart']);
  if(config.project.fe) {
    var files = (config.project.fe.js||[]).concat(config.project.fe.css||[]);
    gulp.watch(files.concat(config.project.fe.scss?[config.project.fe.scss.src+'/**/*.scss']:[]), ['inject']);
    gulp.watch('./bower.json', ['bower']);
    gulp.watch(files.concat([path.dirname(config.project.fe.index)+'/**/*.html']), ['reload']);
  }
});

gulp.task('docker:restart', function(done) {
  var container = docker.getContainer(package.name);
  container.restart(function(error) {
    done(error);
  });
});
