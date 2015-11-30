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
var redis = require( 'redis' );
var promise = require( 'bluebird' );

var client_ = false;
var not_found_ = {
    country_code2: '',
    region_name: '',
    city_name: ''
  };

//  ----------------------------------------------------------------------------------------------//
module.exports = function( ip ) {

  return new promise( function( resolve, reject ) {

    if ( !client_ ) {
      client_ = redis.createClient();
      client_.select( config.service.redis_db );
    }
    client_.on( 'error', reject );

    if ( !ip ) {
      return reject( new Error( 'Invalid IP' ) );
    }
    var oct = ip.split('.');
    if ( oct.length !== 4 ) {
      return reject( new Error( 'Invalid IP' ) );
    }
    ip = ( 16777216 * parseInt( oct[0] ) ) +
      ( 65536 * parseInt( oct[1] ) ) +
      ( 256 * parseInt( oct[2] ) ) +
      parseInt( oct[3] );

    client_.zrangebyscore( 'ipblocks', ip, '+inf', 'LIMIT', 0, 1, function( err, data ) {
      if ( err ) {
        return reject( err );
      }

      if ( !data.length ) {
        return resolve( not_found_ );
      }

      // check interval
      data = data[0].split( ',' );
      if ( ip < parseInt( data[0]/*min ip*/ ) ) {
        //  no, does not hit
        return resolve( not_found_ );
      }

      //  get location
      client_.zrangebyscore( 'geo', data[1], data[1], 'LIMIT', 0, 1, function( err, data ) {
        if ( err ) {
          return reject( err );
        }
        if ( !data.length ) {
          logger.warn( 'ipblock hit but geo data not found, ip: ' + ip );
          return resolve( not_found_ );
        }
        data = data[0].split(',');
        //  "PT,17,Marco De Canaveses,474250"
        resolve({
          'country_code2': data[0],
          'region_name': data[1],
          'city_name': data[2]
        });
      });
    });
  });
};