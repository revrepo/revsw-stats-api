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
var jgeoip = require( 'jgeoip' );
var dispatcher = require( './dispatcher.js' );
var keys = require( './keys.js' );

var geo = new jgeoip( __dirname + '/../geo_db/GeoLite2-City.mmdb' );
var API_version_ = require( 'fs' ).readFileSync( config.version_file, { encoding: 'utf8' }).trim();


//  ----------------------------------------------------------------------------------------------//
var _404 = function( resp ) {
  resp.writeHead( 404, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>' );
};
var _405 = function( resp ) {
  resp.writeHead( 405, 'Method Not Supported', {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>405</title></head><body>405: Method Not Supported</body></html>' );
};
var _413 = function( resp ) {
  resp.writeHead( 413, 'Request Entity Too Large', {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>413</title></head><body>413: Request Entity Too Large</body></html>' );
};
var _200 = function( resp ) {
  resp.writeHead( 200, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>ok</title></head><body>ok</body></html>' );
};
var _501 = function( resp ) {
  resp.writeHead( 501, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>501</title></head><body>501: Not yet implemented</body></html>' );
};
// var _503 = function( resp ) {
//   resp.writeHead( 503, {
//     'Content-Type': 'text/html'
//   } );
//   resp.end( '<!doctype html><html><head><title>503</title></head><body>503: Service unavailable</body></html>' );
// };

// /v1/stats/apps, PUT method, to add user statistic data;
// /v1/stats/metrics, GET to retrieve metrics.

var endpoint_ = '/v' + config.api.version + '/' + config.api.main_endpoint + '/';
var routes_ = {
  'GET': {},
  'PUT': {}
  // 'POST': {},
};

//  ---------------------------------
//  kinda default
routes_.GET['/'] = function( req, resp ) {
  _200( resp );
};

//  ---------------------------------
routes_.GET[endpoint_ + 'metrics'] = function( req, resp ) {
  _501( resp );
};

//  ---------------------------------
//  apps
routes_.PUT[endpoint_ + 'apps'] = function( req, resp ) {

  var body_ = '';

  req.on( 'data', function( data ) {
    body_ += data;
    if ( body_.length > 10240 ) {
      _413( resp );
    }
  });
  req.on( 'end', function() {
    _200( resp );
    var message;
    try {
      message = JSON.parse( body_ );
      message.processing_started_at = Date.now();
    } catch ( e ) {
      //  TODO: Metric add error
      logger.error( e );
      return;
    }

    //  ip 2 geo position
    var geoip;
    if ( message.network && message.network.cellular_ip_external ) {
      try {
        geoip = geo.getRecord( message.network.cellular_ip_external );
        if ( geoip ) {
          geoip = {
            country_code2: geoip.country.iso_code,
            region_name: ( ( geoip.subdivisions && geoip.subdivisions[0] && geoip.subdivisions[0].iso_code ) || '' ),
            city_name: ( ( geoip.city && geoip.city.names && geoip.city.names.en ) || '' )
          };
        }
      } catch ( e ) {
        logger.warn( e.message );
      }
    }
    message.geoip = geoip || {
      country_code2: '',
      region_name: '',
      city_name: ''
    };

    //  sdk key 2 account id, then handle the message
    keys.getAccountID( message.sdk_key )
      .then( function( aid ) {
        message.account_id = aid;
        return dispatcher.send( message );
      })
      .catch( function( err ) {
        logger.error( err );
        //  todo: metrics
      });

  });
};

//  ---------------------------------
//  healthcheck

var promise = require( 'bluebird' );
routes_.GET[endpoint_ + 'healthcheck'] = function( req, resp ) {

  var messages = [];
  keys.checkMongoConnection()
    .catch( function( err ) {
      messages.push( 'BUMMER: APIkey/AccountID database (MongoDB) connection failure: ' + err.toString() );
    })
    .then( function() {
      return keys.getAccountID( '0' );
    })
    .catch( function( err ) {
      messages.push( 'BUMMER: local Redis server connection failure: ' + err.toString() );
    })
    .then( function() {
      return dispatcher.healthCheck();
    })
    .catch( function( err ) {
      messages.push( 'BUMMER: ElasticSearch cluster health error: ' + err.toString() );
    })
    .then( function() {
      if ( messages.length ) {
        resp.writeHead( 500, { 'Content-Type': 'application/json' });
        resp.end( JSON.stringify({
          message: messages.join('; '),
          version: API_version_
        }) );
      } else {
        resp.writeHead( 200, { 'Content-Type': 'application/json' });
        resp.end( JSON.stringify({
          message: 'Everything is OK',
          version: API_version_
        }) );
      }
    })
};



//  ----------------------------------------------------------------------------------------------//
module.exports = function( req, resp ) {

  if ( routes_[req.method] ) {
    if ( routes_[req.method][req.url] ) {
      routes_[req.method][req.url]( req, resp );
    } else {
      logger.warn( req.method, req.url );
      _404( resp );
    }
  } else {
    logger.warn( 'Warn: method not supported: ' + req.method + ', request: ' + req.url );
    _405( resp );
  }
};

