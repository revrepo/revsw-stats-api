//  ----------------------------------------------------------------------------------------------//
'use strict';

var config = require( 'config' );
var logger = require( 'revsw-logger' )( config.log );
var fs = require( 'fs' );
var redis = require( 'redis' );
var promise = require( 'bluebird' );
promise.promisifyAll( redis.RedisClient.prototype );
promise.promisifyAll( redis.Multi.prototype );

var blocks_file = './GeoLiteCity-Blocks.csv';
var geo_file = './GeoLiteCity-Location.csv';
var block_size = 100000;

//  ---------------------------------
var client = redis.createClient();
client.on( 'error', function( err ) {
  logger.error( 'Redis error ' + err );
} );

//  ---------------------------------
var build_ipblock_commands_ = function() {

  logger.info( 'ipblocks import started' );
  var input = fs.readFileSync( blocks_file );
  logger.info( 'ipblocks input data loaded, parsing' );

  input = input.toString().split( '\n' );
  logger.warn( input.length + ' lines parced' );

  logger.info( 'loading into Redis db' );
  logger.info( 'redis commands creation' );

  var cblocks = [];
  var curr = 2;                 //  to skip first 2 junky records
  var total = input.length - 1; //  to skip last empty line

  while ( curr < total ) {
    var commands = [];
    var last = curr + block_size;
    if ( last > total ) {
      last = total;
    }
    while ( curr < last ) {
      var in_ = input[ curr++ ].replace( /\"/g, '' ).split( ',' );
      commands.push( [ 'zadd', 'ipblocks', parseInt( in_[ 1 ] /*max ip*/ ), in_[ 0 ] /*min ip*/ + ',' + in_[ 2 ] /*location id*/ ] );
    }
    cblocks.push( commands );
  }
  input = [];
  return cblocks;
};

//  ---------------------------------
var build_geo_commands_ = function() {

  logger.info( 'geo import started' );
  var input = fs.readFileSync( geo_file );
  logger.info( 'geo input data loaded, parsing' );

  input = input.toString().split( '\n' );
  logger.warn( input.length + ' lines parced' );

  console.log( 'last line: ' + input[input.length - 1] );

  logger.info( 'loading into Redis db' );
  logger.info( 'redis commands creation' );

  var cblocks = [];
  var curr = 2;                 //  to skip first 2 junky records
  var total = input.length - 1; //  to skip last empty line

  while ( curr < total ) {
    var commands = [];
    var last = curr + block_size;
    if ( last > total ) {
      last = total;
    }
    while ( curr < last ) {
      var in_ = input[ curr++ ].replace( /\"/g, '' ).split( ',' );
      //client.zadd(  );
      commands.push( [ 'zadd', 'geo', parseInt( in_[0] /*location id*/ ), in_[1] /*country2*/ + ',' + in_[2] /*region2*/ + ',' + in_[3] /*city*/ + ',' + in_[0] /*location id again*/ ] );
    }
    cblocks.push( commands );
  }
  input = [];
  return cblocks;
};

//  ----------------------------------------------------------------------------------------------//

var cblocks = build_ipblock_commands_();

client.selectAsync( config.service.redis_db )
  .then( function() {
    return client.delAsync( 'ipblocks' );
  })
  .then( function() {

    logger.info( 'redis commands fire' );
    return promise.each( cblocks, function( commands ) {
      logger.info( 'fire ' + commands.length );
      return client.multi( commands ).execAsync();
    });
  })
  .then( function() {

    logger.info( 'ipblocks done' );
    cblocks = build_geo_commands_();
    return client.delAsync( 'geo' );
  })
  .then( function() {

    logger.info( 'redis commands fire' );
    return promise.each( cblocks, function( commands ) {
      logger.info( 'fire ' + commands.length );
      return client.multi( commands ).execAsync();
    });
  })
  .then( function() {

    logger.info( 'geo done' );
    client.quit();
    process.exit( 0 );

  }).catch( function( err ) {
    logger.error( err );
    process.exit( 1 );
  });

