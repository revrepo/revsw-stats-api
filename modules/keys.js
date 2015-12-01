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

var _ = require( 'lodash' );
var config = require( 'config' );
var logger = require('revsw-logger')( config.log );
var redis = require( 'redis' );
var promise = require( 'bluebird' );
var mongo = require('mongodb');

var redis_client_ = false;

//  ----------------------------------------------------------------------------------------------//
module.exports = {

  loadKeys2Redis: function() {

    if ( !redis_client_ ) {
      redis_client_ = redis.createClient();
      redis_client_.select( config.service.redis_db );
    }

    return new promise( function( resolve, reject ) {

      redis_client_.on( 'error', reject );
      mongo.MongoClient.connect( config.service.key_id.db_connection, function( err, db ) {

        if ( err ) {
          logger.error( err );
          return reject( err );
        }

        //  load currently actual keys from the far-away mongodb
        db.collection( config.service.key_id.collection )
          .find({ active: true }, { _id:0, key: 1, account_id: 1 }).toArray( function( err, mkeys ) {

            // [ { account_id: '55ce53e7b80bc058063c383c', key: '655dd9bb-c3db-4c5e-aa47-2cd97df82ede' },
            //   { account_id: '55a6b99d9faa2de1106f07aa', key: '40a7a51f-70eb-47c6-88af-ada4576950fa' } ]

            if ( err ) {
              logger.error( err );
              return reject( err );
            }

            // load redis stored key-id pairs
            redis_client_.keys( 'keys:*', function( err, rkeys ) {
              if ( err ) {
                logger.error( err );
                return reject( err );
              }

              //  prepare commands
              var commands = [];
              //  set keys
              var commands = _.map( mkeys, function( item ) {
                return ['set', 'keys:' + item.key, item.account_id];
              });
              var results = { set: commands.length, deleted: 0 };
              // find pairs to remove
              for ( var i = 0, len = rkeys.length; i < len; ++i ) {
                  var rkey = rkeys[i].substr(5);
                  if ( !_.find( mkeys, function( item ) {
                        return item.key === rkey;
                      }) ) {
                    commands.push( [ 'del', 'keys:' + rkey ] );
                    ++results.deleted;
                  }
              };
              //  then fire commands
              redis_client_.multi( commands ).exec( function( err, resp ) {
                if ( err ) {
                  logger.error( err );
                  return reject( err );
                }
                results.resp = resp;
                resolve( results );
              });
            });
          });
      });
    });
  },

  getAccountID: function( key ) {

    if ( !redis_client_ ) {
      redis_client_ = redis.createClient();
      redis_client_.select( config.service.redis_db );
    }

    return new promise( function( resolve, reject ) {

      redis_client_.get( 'keys:' + key, function( err, data ) {
        if ( err ) {
          logger.error( err );
          return reject( err );
        }
        resolve( data );
      });
    });
  },
};