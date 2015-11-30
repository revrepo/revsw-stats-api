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

var config = require( 'config' );
var logger = require('revsw-logger')( config.log );
var promise = require( 'bluebird' );
var elastic = require('elasticsearch');

var client_ = false;
var client_url_ = false;

var curr_queue_ = [];
var being_sent_ = 0;

var last_call_ = 0;
var queue_cleaner_ = null;

//  ---------------------------------
//  index name from a date
var get_index_ = function( timestamp ) {
  var d = new Date( timestamp );
  return config.service.index_prefix + d.getUTCFullYear() + '.' +
    ('0' + (d.getUTCMonth() + 1)).slice(-2) + '.' +
    ('0' + d.getUTCDate()).slice(-2);
};

//  ---------------------------------
//  upload one time one portion of data(full queue)
var fire_once_ = function( shot ) {

  return client_url_.bulk( shot.req )
    .then( function() {
      //  job is done
      shot.tries = 0;
    })
    .catch( function( err ) {
      //  todo, metrics
      //  shit happened
      logger.error( err );
      if ( --shot.tries ) {
        //  tries still remain, delay then fire again
        return promise.delay( config.service.send_tries_timeout );
      }
      //  fucked up totally
      throw err;
    })
    .then( function() {
      //  we can get here from the above "then" or the above "catch"
      if ( shot.tries ) {
        //  not yet done, again
        return fire_once_( shot );
      }
    });
};

//  ---------------------------------
//  decorate the queue with metadata, prepare ES bulk request and invoke the fire_once_
var fire_queue_ = function() {

  var shot = {
    tries: config.service.send_tries_num,
    fired_at: ( Date.now() ),
    req: {
      type: config.service.index_type,
      refresh: true,
      body: curr_queue_
    }
  };
  curr_queue_ = [];
  ++being_sent_;

  logger.info( 'fire, bs: ' + being_sent_ );

  return fire_once_( shot )
    .then( function() {
      return loose_queue_();
    })
    .catch( function( err ) {
      logger.error( 'request is fucked up completely', err );
      return loose_queue_();
    })
    .finally( function() {
      logger.info( 'fire completed, bs: ' + being_sent_ );
    });

};

//  ---------------------------------
//  decrement the active requests number, and if there just was overload - loose the current queue
var loose_queue_ = function() {
  if ( being_sent_-- >= config.service.max_requests &&
    curr_queue_.length >= config.service.upload_size * 2 ) {
      //  it was overloaded one tick ago - too many requests were being sent and current queue was full
    return fire_queue_();
  }
  return false;
};


//  ----------------------------------------------------------------------------------------------//
module.exports = {

  queueSize: function() {
    return curr_queue_.length / 2;
  },

  beingSent: function() {
    return being_sent_;
  },

  send: function( message ) {

    if ( !client_ ) {
      client_ = new elastic.Client( config.service.elastic_es );
      client_url_ = new elastic.Client( config.service.elastic_esurl );

      queue_cleaner_ = setInterval( function() {
        //  if non-empty queue stays too long without move - fire it even if it not full
        if ( ( Date.now() - last_call_ ) > config.service.queue_clear_timeout &&
          curr_queue_.length > 0 ) {
          logger.info( 'queue timed out, fire, ' + curr_queue_.length );
          fire_queue_();
        }
      }, config.service.queue_clear_timeout );
    }

    message.rtimestamp = last_call_ = Date.now();

    if ( curr_queue_.length < config.service.upload_size * 2 ) {
      //  queue is not full

      curr_queue_.push({
        index: {
          _index: get_index_( message.log_events.timestamp || message.rtimestamp ),
        }
      });
      curr_queue_.push( message );
      return;
    }

    //  well, current queue IS full
    if ( being_sent_ < config.service.max_requests ) {
      //  not too many requests are being sent - add the current queue to them
      fire_queue_();

      //  here the current queue is empty and shining
      curr_queue_.push({
        index: {
          _index: get_index_( message.log_events.timestamp || message.rtimestamp ),
        }
      });
      curr_queue_.push( message );
      return;
    }

    //  BUMPER! overload: too many requests are being sent and queue is full

    //  do nothing actually
    //  todo: metric
    return;
  },


};

