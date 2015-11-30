/*jslint node: true */
'use strict';

var gulp = require('gulp');
var forever = require('forever-monitor'); //https://github.com/ortexx/gulp-forever-monitor
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');
var stylish = require('jshint-stylish');
var gutil = require('gulp-util');
var fatalLevel = require('yargs').argv.fatal;

var config = {}; // todo revsw config
config.appName = 'revsw-api';

// Server handler
var server = new forever.Monitor('bin/revsw-api.js', {
  env: {DEBUG: config.appName + '*', DEBUG_COLORS: 1},
  killSignal: 'SIGINT',
  watch: false
}).start();


// Error handling
// Command line option:
//  --fatal=[warning|error|off]


var ERROR_LEVELS = ['error', 'warning'];

function isFatal(level) {
  return ERROR_LEVELS.indexOf(level) <= ERROR_LEVELS.indexOf(fatalLevel || 'error');
}

// Handle an error based on its severity level.
// Log all levels, and exit the process for fatal levels.
function handleError(level, error) {
  gutil.log(error.message);
  if (isFatal(level)) {
    server.stop();
    process.exit(1);
  }
}

// Convenience handler for error-level errors.
function onError(error) {
  handleError.call(this, 'error', error);
}
// Convenience handler for warning-level errors.
function onWarning(error) {
  handleError.call(this, 'warning', error);
}

// Gulp tasks

gulp.task('serve', function (cb) {
  setTimeout(cb, 3000);
});

gulp.task('watch', ['serve'], function() {
  gulp.watch([
    './bin/**/*.js',
    './lib/**/*.js',
    './models/**/*.js',
    './routes/**/*.js',
    './handlers/**/*.js',
    './config/**/*.json'
  ], [], [
    'reload',
  ]);
});

gulp.task('reload', ['lint'], function (cb) {
  server.restart();
  setTimeout(cb, 3000);
});

gulp.task('lint', [], function (cb) {
  return gulp.src([
    './bin/**/*.js',
    './lib/**/*.js'
  ])
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

// Event tasks

/*// Run mocha tests on restart
server.on('restart', function () { // TODO move server.on('restart') to invoke a gulp task 'restart'
  function test() {
    gulp.src(run_tests)
      .pipe(mocha())
      .on('error', onWarning);
  }
  setTimeout(test, 4000);
});*/

// Define default

gulp.task('default', ['serve', 'watch']);
