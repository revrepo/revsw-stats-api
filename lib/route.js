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
var promise = require( 'bluebird' );

var dispatcher = require( './dispatcher.js' );
var keys = require( './keys.js' );
var metrics = require( './metrics.js' );

var geo = new jgeoip( __dirname + '/../geo_db/GeoLite2-City.mmdb' );
var API_version_ = require( 'fs' ).readFileSync( config.version_file, { encoding: 'utf8' }).trim();

var ip_ = false;

//  ----------------------------------------------------------------------------------------------//
var _400 = function( resp ) {
  resp.writeHead( 400, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>400</title></head><body>400: Bad Bad Request</body></html>' );
};
var _401 = function( resp ) {
  resp.writeHead( 401, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>401</title></head><body>401: WTF are ya doin here, buddy</body></html>' );
};
var _404 = function( resp ) {
  resp.writeHead( 404, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>' );
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


var endpoint_ = '/v' + config.api.version + '/';
var endpoint_stats_ = endpoint_ + config.api.main_endpoint + '/';
var routes_ = {
  'GET': {},
  'PUT': {},
  'POST': {}
};

//  ---------------------------------
//  kinda default
routes_.GET['/'] = function( req, resp ) {
  _200( resp );
};

//  ---------------------------------
//  kinda debug/testing
 routes_.POST['/test'] = function( req, resp ) {

   resp.writeHead( 200, { 'Content-Type': 'application/json' });
   resp.end( JSON.stringify({
     headers: req.headers,
     conn: req.connection.remoteAddress
   }) );
};

//  ---------------------------------
//  apps

routes_.PUT[endpoint_stats_ + 'apps'] = function( req, resp ) {

  var body_ = '';

  req.on( 'data', function( data ) {
    body_ += data;
    if ( body_.length > 10240 ) {
      _413( resp );
    }
  });

  req.on( 'end', function() {
    var message;
    try {
      message = JSON.parse( body_ );
      logger.debug( 'ip: ' + ip_, message );
      message.received_at = Date.now();
    } catch ( e ) {
      //  JSON not parsed properly
      logger.error( 'ip: ' + ip_, e );
      metrics.addMetric( 'errors' );
      _400( resp );
      return;
    }

    //  sdk key 2 account id, then handle the message
    keys.getAccountAppIDs( message.sdk_key )
      .then( function( ids ) {
        if ( !ids ) {
          logger.warn( 'SDK_KEY not found, 401, ip: ' + ip_ + ', key: ' + message.sdk_key );
          _401( resp );
          return;
        }

        message.account_id = ids.account_id;
        message.app_id = ids.app_id || '';
        logger.debug( 'account id: ' + ids.account_id + ', app id: ' + ids.app_id );
        _200( resp );

        //  ip 2 geo position
        var geoip;
        try {
          geoip = geo.getRecord( ip_ );
          if ( geoip ) {
            geoip = {
              country_code2: geoip.country.iso_code,
              region_name: ( ( geoip.subdivisions && geoip.subdivisions[0] && geoip.subdivisions[0].iso_code ) || '' ),
              city_name: ( ( geoip.city && geoip.city.names && geoip.city.names.en ) || '' )
            };
          }
        } catch ( e ) {
          logger.warn( 'ip: ' + ip_, e.message );
          // metrics.addMetric( 'errors' );
        }

        message.ip = ip_;
        message.geoip = geoip || {
          country_code2: '',
          region_name: '',
          city_name: ''
        };

        logger.debug( 'geoip: ', message.geoip );
        return dispatcher.handle( message );
      });
  });
};
//  temporary workaround
routes_.POST[endpoint_stats_ + 'apps'] = routes_.PUT[endpoint_stats_ + 'apps'];

//  ---------------------------------
//  healthcheck

routes_.GET[endpoint_ + 'healthcheck'] = function( req, resp ) {

  var messages = [];
  keys.checkMongoStatus()
    .catch( function( err ) {
      messages.push( 'BUMMER: APIkey/AccountID database (MongoDB) update failed: ' + err.toString() );
    })
    .then( function() {
      return keys.getAccountAppIDs( '0' );
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
    });
};

//  ---------------------------------
//  force-keys-reload

routes_.POST[endpoint_ + 'force-keys-reload'] = function( req, resp ) {

  keys.loadKeys2Redis()
    .then( function( response ) {
      var msg = 'forced keys reload: pairs loaded ' + response.set + ', deleted ' + response.deleted;
      logger.info( msg );
      resp.writeHead( 200, { 'Content-Type': 'application/json' });
      resp.end( JSON.stringify({
        message: msg,
        version: API_version_
      }) );
    })
    .catch( function( err ) {
      logger.error( err );
      resp.writeHead( 500, { 'Content-Type': 'application/json' });
      resp.end( JSON.stringify({
        message: 'SDK keys reloading failed',
        version: API_version_
      }) );
    });
};

//  ---------------------------------
//  force-fire-queue

routes_.POST[endpoint_ + 'force-fire-queue'] = function( req, resp ) {

  dispatcher.forceFireQueue()
    .then( function( response ) {
      logger.info( 'forced fire queue, completed' );
      resp.writeHead( 200, { 'Content-Type': 'application/json' });
      resp.end( JSON.stringify({
        message: 'done',
        version: API_version_
      }) );
    })
    .catch( function( err ) {
      logger.error( err );
      resp.writeHead( 500, { 'Content-Type': 'application/json' });
      resp.end( JSON.stringify({
        message: err.toString(),
        version: API_version_
      }) );
    });
};

//  ---------------------------------
//  status

routes_.GET[endpoint_stats_ + 'status'] = function( req, resp ) {

  metrics.getMetrics()
    .then( function( data ) {
      resp.writeHead( 200, { 'Content-Type': 'application/json' });
      resp.end( JSON.stringify( data ) );
    })
    .catch( function( err ) {
      resp.writeHead( 500, { 'Content-Type': 'application/json' });
      resp.end( JSON.stringify( err ) );
    });
};

//  ----------------------------------------------------------------------------------------------//
module.exports = function( req, resp ) {

  ip_ = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if ( !routes_[req.method] || !routes_[req.method][req.url] ) {
    logger.warn( '404(not found), ip: ' + ip_ + ', method: ' + req.method + ', url: ' + req.url );
    _404( resp );
    return;
  }

  //  here we go
  routes_[req.method][req.url]( req, resp );
};

