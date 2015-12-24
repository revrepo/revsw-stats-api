/*************************************************************************
 *
 * REV SOFTWARE CONFIDENTIAL
 *
 * [2013] - [2015] Rev Software, Inc.
 * All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rev Software, Inc. and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Rev Software, Inc.
 * and its suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Rev Software, Inc.
 */

/*jslint node: true */
'use strict';

//  ----------------------------------------------------------------------------------------------//

var _ = require( 'lodash' );
var config = require( 'config' );
var logger = require('revsw-logger')( config.log );
var promise = require( 'bluebird' );

var redis = require( './redis.js' );

//  ----------------------------------------------------------------------------------------------//
//  some "consts"
var QUANTUM = 60000;        //  1 min
var DB_SPAN = QUANTUM * 15; //  period to keep data in Redis
var RPS_SPAN = 3000;        //  RPS measure period

//  ---------------------------------
var metrics_ = {};
var rps_data_ = {};

//  ---------------------------------
var reset_ = function() {
  var n = metrics_.notch === undefined ? Math.floor( Date.now() / QUANTUM ) : metrics_.notch + 1;
  metrics_ = {
    notch: n,
    count: 0,
    rps_min: 1000000,
    rps_max: 0,
    rps_avg: 0,
    proc_count: 0,
    proc_min_ms: 1000000,
    proc_max_ms: 0,
    proc_avg_ms: 0,
    mongoErrors: 0,
    esErrors: 0,
    queueErrors: 0,
    workerDeaths: 0,
    errors: 0,
  };
  rps_data_ = {
    count: 0,
    notch: Date.now()
  };
};

//  ---------------------------------
var to_;
var next_fire_ = function() {
  var d = Date.now();
  //  10 seconds before end of the current period
  d = ( metrics_.notch + ( 5 / 6 ) ) * QUANTUM - d;
  to_ = setTimeout( the_task_, d );
};

//  ---------------------------------
//  big thing
var the_task_ = function() {

  if ( redis.ready() ) {

    //  save stuff
    var key = 'metrics:' + metrics_.notch + ':' + process.pid;
    var val = JSON.stringify( metrics_ );

    redis.client().set( key, val, 'PX', DB_SPAN, function( err, resp ) {
      if ( err ) {
        logger.error( 'Metrics save error:', err );
      }
    });
  } else {
    logger.error( 'Metrics save error: Redis server is not ready' );
  }

  reset_();
  next_fire_();
};

//  ----------------------------------------------------------------------------------------------//
//  here we go

reset_();
next_fire_();

//  every 3s count/notch RPS
var rps_interval_ = setInterval( function() {
  var d = Date.now(),
    rps = ( metrics_.count - rps_data_.count ) * 1000 / ( d - rps_data_.notch );
  rps_data_.notch = d;
  rps_data_.count = metrics_.count;
  if ( rps > metrics_.rps_max ) {
    metrics_.rps_max = rps;
  }
  if ( rps < metrics_.rps_min ) {
    metrics_.rps_min = rps;
  }

  //  debug
  // logger.info( 'RPS: ' + rps );

}, RPS_SPAN ) ;


//  ----------------------------------------------------------------------------------------------//
module.exports = {

  addMetric: function( name, val ) {
    metrics_[name] += ( val || 1 );
  },

  updateProcessing: function( count, min_, max_, total ) {
    metrics_.proc_count += count;
    metrics_.proc_avg_ms += total;
    if ( min_ < metrics_.proc_min_ms ) {
      metrics_.proc_min_ms = min_;
    }
    if ( max_ > metrics_.proc_max_ms ) {
      metrics_.proc_max_ms = max_;
    }
    //  debug
    // logger.info( count, min_, max_, total );
    // logger.info( metrics_ );
  },

  //  ---------------------------------
  //  span in minutes(quantas)
  getMetrics: function( spans ) {

    return new promise( function( resolve, reject ) {

      if ( !redis.ready() ) {
        return reject( 'getMetrics error: Redis server is not ready' );
      }

      spans = spans || 1;

      //  first load all metrics keys
      redis.client().keys( 'metrics:*', function( err, keys ) {
        if ( err ) {
          logger.error( 'getMetrics error: ', err );
          return reject( err );
        }

        var thr = Math.floor( Date.now() / QUANTUM ) - spans;
        keys = _.filter( keys, function( key ) {
          return parseInt( (key.split(':'))[1] ) >= thr;
        });

        var commands = _.map( keys, function( item ) {

          //  debug
          // logger.info( 'key found: ' + (new Date( parseInt( (item.split(':'))[1] ) * QUANTUM ) ).toUTCString() );
          return ['get', item];
        });

        redis.client().multi( commands ).exec( function( err, resp ) {
          if ( err ) {
            logger.error( 'getMetrics error: ', err );
            return reject( err );
          }
          var metric = {
            count: 0,
            rps_min: 1000000,
            rps_max: 0,
            rps_avg: 0,
            proc_count: 0,
            proc_min_ms: 1000000,
            proc_max_ms: 0,
            proc_avg_ms: 0,
            mongoErrors: 0,
            esErrors: 0,
            queueErrors: 0,
            workerDeaths: 0,
            errors: 0,
            __dbg_records_num: resp.length
          };
          _.each( resp, function( item, idx ) {
            item = JSON.parse( item );
            metric.count += item.count;
            metric.proc_count += item.proc_count;
            metric.rps_avg += item.rps_avg;
            metric.proc_avg_ms += item.proc_avg_ms;
            metric.errors += item.errors;
            metric.mongoErrors += item.mongoErrors;
            metric.esErrors += item.esErrors;
            metric.queueErrors += item.queueErrors;
            metric.workerDeaths += item.workerDeaths;
            if ( item.rps_min < metric.rps_min  ) {
              metric.rps_min = item.rps_min;
            }
            if ( item.rps_max > metric.rps_max ) {
              metric.rps_max = item.rps_max;
            }
            if ( item.proc_min_ms < metric.proc_min_ms ) {
              metric.proc_min_ms = item.proc_min_ms;
            }
            if ( item.proc_max_ms > metric.proc_max_ms ) {
              metric.proc_max_ms = item.proc_max_ms;
            }
          });

          if ( metric.rps_min === 1000000 ) {
            metric.rps_min = -1;
          }
          if ( metric.proc_min_ms === 1000000 ) {
            metric.proc_min_ms = -1;
          }
          if ( metric.count !== 0 ) {
            metric.rps_avg = metric.count * 1000 / QUANTUM;
          }
          if ( metric.proc_count !== 0 ) {
            metric.proc_avg_ms /= metric.proc_count;
          }

          resolve( metric );
        });
      });
    });
  },

  //  ---------------------------------
  //  statuses
  updateStatus: function( key, val ) {

    return new promise( function( resolve, reject ) {

      if ( !redis.ready() ) {
        return reject( 'updateStatus error: Redis server is not ready' );
      }
      redis.client().set( 'status:' + key, val, function( err, res ) {
        if ( err ) {
          logger.error( 'updateStatus error: ', err );
          return reject( err );
        }
        resolve( res );
      });
    });
  },

  getStatus: function( key ) {

    return new promise( function( resolve, reject ) {

      if ( !redis.ready() ) {
        return reject( 'getStatus error: Redis server is not ready' );
      }
      redis.client().get( 'status:' + key, function( err, res ) {
        if ( err ) {
          logger.error( 'getStatus error: ', err );
          return reject( err );
        }
        resolve( res );
      });
    });
  },

};