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
var http = require( 'http' );
var config = require( 'config' );
var logger = require('revsw-logger')( config.log );

var route = require( '../modules/route.js' );

//  ----------------------------------------------------------------------------------------------//
//  init cluster

if ( cluster.isMaster ) {
//  main cluster process

  var numCPUs = require( 'os' ).cpus().length;

  // run workers
  for ( var i = 0; i < numCPUs; i++ ) {
    cluster.fork();
  }

  logger.info( 'master pid ' + process.pid );
  cluster.on( 'exit', function( worker, code, signal ) {
    logger.warn( 'worker ' + worker.process.pid + ' died' );
  });

} else {
//  worker
  logger.info( 'worker pid ' + process.pid );

  http.createServer( function( req, resp ) {
    route( req, resp );
  }).listen( config.service.http_port );

}
