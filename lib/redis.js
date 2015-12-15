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
var logger = require( 'revsw-logger' )( config.log );
var redis = require( 'redis' );

var redis_client_ = false;
var redis_ready_ = true;

//  ----------------------------------------------------------------------------------------------//
module.exports = {

  client: function() {
    if ( !redis_client_ ) {
      redis_client_ = redis.createClient({
        // port: 6379,
        retry_max_delay: 10000
      });
      redis_client_.select( config.service.redis_db );

      redis_client_.on( 'error', function() {
        logger.error( 'Redis client: server connection error' );
        redis_ready_ = false;
      });
      redis_client_.on( 'ready', function() {
        logger.warn( 'Redis client: ready' );
        redis_ready_ = true;
      });

    }
    return redis_client_;
  },

  ready: function() {
    return redis_ready_;
  }

};

