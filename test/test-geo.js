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

var should = require('should-http');
// var request = require('supertest');
// var request = require('supertest-as-promised');

var geo = require('../lib/geo.js');

//  here we go
describe('Rev SDK stats API', function() {

  this.timeout( 10000 );

  var validIPs;
  var invalidIPs;

  before( function( done ) {
    validIPs = [
      { ip: '185.12.178.250',
        country_code2: 'DE',
        region_name: '',
        city_name: '' },
      { ip: '209.85.160.179',
        country_code2: 'US',
        region_name: 'CA',
        city_name: 'Mountain View' },
      { ip: '174.36.207.186',
        country_code2: 'US',
        region_name: 'VA',
        city_name: 'Chantilly' },
      { ip: '178.79.180.155',
        country_code2: 'GB',
        region_name: '',
        city_name: '' },
      { ip: '127.0.0.1',
        country_code2: '',
        region_name: '',
        city_name: '' }
    ];
    invalidIPs = [
      { ip: '127.0.0',
        country_code2: '',
        region_name: '',
        city_name: '' },
      { ip: '',
        country_code2: '',
        region_name: '',
        city_name: '' },
      { ip: 'junkie-string_here',
        country_code2: '',
        region_name: '',
        city_name: '' }
    ];
    done();
  });

  describe('Geo module', function() {

    var resolve = function( ip_data ) {
      return geo( ip_data.ip )
        .then( function( data ) {
          if ( data.country_code2 !== ip_data.country_code2 ||
               data.region_name !== ip_data.region_name ||
               data.city_name !== ip_data.city_name ) {
            throw new Error( 'IP is not resolved' );
          }
        });
    };

    it('should resolve valid IPs', function(done) {

      promise.each( validIPs, resolve )
        .then( function() {
          done();
        })
        .catch( done );

    });

    it('should correctly handle invalid IPs', function(done) {

      promise.each( invalidIPs, resolve )
        .then( function() {
          done();
        })
        .catch( done );

    });

  });

});

