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

require('should-http');
var config = require( 'config' );
var promise = require( 'bluebird' );
var fs = promise.promisifyAll(require('fs'));
var dispatcher = require('../lib/dispatcher.js');

//  ----------------------------------------------------------------------------------------------//

var one_message_,
  ill_formed_message_;

//  ---------------------------------
var load_msg_files_ = function() {
  return fs.readFileAsync( './test/message.50.json', 'utf8' )
    .then( JSON.parse )
    .then( function( data ) {
      one_message_ = data;
      one_message_.ip = '8.8.8.8';
      return fs.readFileAsync( './test/message.50.ill-formed.json', 'utf8' );
    })
    .then( JSON.parse )
    .then( function( data ) {
      ill_formed_message_ = data;
    });
};

//  ----------------------------------------------------------------------------------------------//


//  here we go
describe.skip('Rev SDK stats API, overall testing', function() {

  this.timeout( config.service.queue_clear_timeout * 3 );

  before( function( done ) {
    console.log( '    ### data preparation' );

    one_message_.network.cellular_ip_external = '8.8.8.8';
    one_message_.log_events.timestamp = now_;
    console.log( '    ### app_name ' + one_message_.app_name );
    console.log( '    ### queue_clear_timeout set to ' + config.service.queue_clear_timeout + 'ms, done' );
    done();
  });

  //  ---------------------------------
  it('dispatcher should successfully gulp half of message queue', function( done ) {

    var half = Math.floor( config.service.upload_size / 2 );
    for ( var i = 0; i < half; ++i ) {
      dispatcher.handle( one_message_ );
    }

    dispatcher.queueSize().should.be.equal( half );
    dispatcher.beingSent().should.be.equal( 0 );
    done();
  });

  it('dispatcher should send filled up message queue', function( done ) {

    var half = Math.floor( config.service.upload_size / 2 );
    for ( var i = 0; i < config.service.upload_size; ++i ) {
      dispatcher.handle( one_message_ );
    }

    dispatcher.queueSize().should.be.equal( half );
    dispatcher.beingSent().should.be.equal( 1 );
    done();
  });

  it('dispatcher should send un-filled message queue after queue_clear_timeout', function( done ) {

    var notch = dispatcher.beenSent();
    console.log( '    ### wait (' + ( config.service.queue_clear_timeout * 2 ) + ' ms) ...' );
    setTimeout( function() {
      console.log( '    ### gotcha' );
      dispatcher.queueSize().should.be.equal( 0 );
      dispatcher.beenSent().should.be.equal( notch + 1 );
      done();
    }, config.service.queue_clear_timeout * 2 + 2000 );

  });

});

