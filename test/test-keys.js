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
var keys = require('../lib/keys.js');

//  here we go
describe('Rev SDK stats API', function() {

  this.timeout( 10000 );

  describe('Keys module, APIKey - AppID lookup', function() {

    var keys_num = 0;
    var pair = {};

    before( function( done ) {
      console.log( '    ### data preparation' );
      keys.loadKeys2Redis()
        .then( function( res ) {
          keys_num = res.set;
          return keys.findOneKey();
        })
        .then( function( data ) {
          pair = data;
          return keys.genFakeKeys2Redis( 3 ); //  fake-0, fake-1 and fake-2 for keys and ids
        })
        .then( function() {
          console.log( '    ### done' );
          done();
        })
        .catch( function( err ) {
          done( err );
        });
    });

    it('should successfully lookup generated pairs', function( done ) {

      keys.getAccountAppIDs( 'fake-0' )
        .then( function( id ) {
          id.account_id.should.be.equal( 'fake-0' );
          return keys.getAccountAppIDs( 'fake-1' );
        })
        .then( function( id ) {
          id.account_id.should.be.equal( 'fake-1' );
          return keys.getAccountAppIDs( 'fake-2' );
        })
        .then( function( id ) {
          id.account_id.should.be.equal( 'fake-2' );
          done();
        })
        .catch( done );

    });

    it('should successfully import data', function( done ) {

      keys.loadKeys2Redis()
        .then( function( res ) {
          res.set.should.be.equal( keys_num );
          res.deleted.should.be.equal( 3 );
          done();
        })
        .catch( done );

    });

    it('should successfully lookup imported pair', function( done ) {

      keys.getAccountAppIDs( pair.sdk_key )
        .then( function( id ) {
          id.account_id.should.be.equal( pair.account_id );
          done();
        })
        .catch( done );

    });
  });

});

