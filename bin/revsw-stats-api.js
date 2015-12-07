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

var cluster = require( 'cluster' );
var https = require( 'https' );
var fs = require( 'fs' );
var config = require( 'config' );
var logger = require('revsw-logger')( config.log );

var keys = require( '../lib/keys.js' );
var route = require( '../lib/route.js' );

//  ----------------------------------------------------------------------------------------------//
//  init cluster

if ( cluster.isMaster ) {
//  main cluster process

  var numCPUs = require( 'os' ).cpus().length;

  logger.info( 'Master pid ' + process.pid );

  logger.info( 'loading APIKeys/AccountID pairs' );
  keys.loadKeys2Redis()
    .then( function( response ) {
      logger.info( 'pairs loaded ' + response.set + ', deleted ' + response.deleted );

      //  run workers
      for ( var i = 0; i < numCPUs; i++ ) {
        cluster.fork();
      }

      cluster.on( 'exit', function( worker, code, signal ) {
        logger.warn( 'worker ' + worker.process.pid + ' died' );
      });

      //  keys Redis store update
      setInterval( function() {
        keys.loadKeys2Redis()
          .then( function( response ) {
            logger.info( 'Keys/ID pairs loaded ' + response.set + ', deleted ' + response.deleted );
          })
          .catch( function( err ) {
            logger.error( 'Keys/ID pairs not loaded: ', err );
          });

      }, config.service.key_id.poll_interval );

    })
    .catch( function( err ) {
      logger.error( err );
    });

} else {
//  worker
  var port = config.service.https_port;
  logger.info( 'worker pid ' + process.pid + ', starting server at port ' + port );

  var opts = {
      key: fs.readFileSync( config.service.key_path ),
      cert: fs.readFileSync( config.service.cert_path )
    };

  https.createServer( opts, function( req, resp ) {
    route( req, resp );
  }).listen( port );

}
