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

var _ = require('lodash');
var config = require('config');
var logger = require('revsw-logger')(config.log);
var promise = require('bluebird');
var mongo = require('mongodb');

var redis = require('./redis.js');
var metrics = require('./metrics.js');


//  ----------------------------------------------------------------------------------------------//
module.exports = {

  //  ---------------------------------
  //  load sdk_key, account_id and app_id tuples and store it to the local db (Redis)
  loadKeys2Redis: function() {

    return new promise(function(resolve, reject) {

      if (!redis.ready()) {
        return reject('Redis server is not ready');
      }

      mongo.MongoClient.connect(config.service.key_id.db_connection, function(err, db) {

        if (err) {
          logger.error(err);
          metrics.addMetric('mongoErrors');
          return reject(err);
        }

        //  load currently actual keys from the far-away mongodb
        db.collection(config.service.key_id.collection)
          .find({
            deleted: false
          }, {
            _id: 1,
            sdk_key: 1,
            account_id: 1
          }).toArray(function(err, mkeys) {

            // [{ _id: 565cd68c64aaa98d0e6be9e3,
            //   account_id: '55b6ff6a7957012304a49d04',
            //   sdk_key: 'fcd69272-5592-4890-ae85-daea44056e3a' },
            // { _id: 5659eef0b65e9d9e72531783,
            //   account_id: '55b6ff6a7957012304a49d04',
            //   sdk_key: '3185ae13-5932-43d1-889d-05b77d2547f9' }]

            if (err) {
              logger.error(err);
              metrics.addMetric('mongoErrors');
              return reject(err);
            }

            db.close();

            // load redis stored key-id pairs
            redis.client().keys('keys:*', function(err, rkeys) {
              if (err) {
                logger.error(err);
                metrics.addMetric('errors');
                return reject(err);
              }

              //  prepare commands
              var commands = [];
              //  set keys
              commands = _.map(mkeys, function(item) {
                return ['set', 'keys:' + item.sdk_key, item.account_id + ',' + item._id.toString()]; //  "account_id,app_id"
              });
              var results = {
                set: commands.length,
                deleted: 0
              };
              var rkey;
              var key_compare_ = function(item) {
                return item.sdk_key === rkey;
              };
              // find pairs to remove
              for (var i = 0, len = rkeys.length; i < len; ++i) {
                rkey = rkeys[i].substr(5);
                if (!_.find(mkeys, key_compare_)) {
                  commands.push(['del', 'keys:' + rkey]);
                  ++results.deleted;
                }
              }
              //  then fire commands
              redis.client().multi(commands).exec(function(err, resp) {
                if (err) {
                  logger.error(err);
                  metrics.addMetric('errors');
                  return reject(err);
                }
                results.resp = resp;
                metrics.updateStatus('loadKeys2Redis', Date.now());
                resolve(results);
              });
            });
          });
      });
    });
  },

  //  lookup account_id/app_id pair by sdk_key
  getAccountAppIDs: function(key) {

    return new promise(function(resolve, reject) {

      if (!redis.ready()) {
        return reject('Redis server is not ready');
      }

      redis.client().get('keys:' + key, function(err, data) {
        if (err) {
          logger.error(err);
          metrics.addMetric('errors');
          return reject(err);
        }
        if (!data) {
          return resolve(false);
        }
        data = data.split(',');
        resolve({
          account_id: data[0],
          app_id: (data.length === 1 ? false : data[1])
        });
      });
    });
  },

  checkMongoStatus: function(key) {

    return metrics.getStatus('loadKeys2Redis')
      .then(function(data) {
        var span = Date.now() - parseInt(data);
        if (span > (config.service.key_id.poll_interval + 10000 /*10s just to be sure*/ )) {
          throw new Error('poll interval exceeded: ' + Math.round(span / 1000) + 's');
        }
      });
  },


  //  ---------------------------------
  //  testing

  genFakeKeys2Redis: function(keys_num, prefix) {

    keys_num = keys_num || 3;
    prefix = prefix || 'fake-';

    return new promise(function(resolve, reject) {

      if (!redis.ready()) {
        return reject('Redis server is not ready');
      }

      //  prepare commands
      var commands = [];
      //  set keys
      for (var i = 0; i < keys_num; ++i) {
        commands.push(['set', 'keys:' + prefix + i, prefix + i]);
      }
      //  then fire commands
      redis.client().multi(commands).exec(function(err /*, resp*/ ) {
        if (err) {
          logger.error(err);
          return reject(err);
        }
        resolve();
      });
    });
  },

  findOneKey: function() {

    return new promise(function(resolve, reject) {

      mongo.MongoClient.connect(config.service.key_id.db_connection, function(err, db) {

        if (err) {
          logger.error(err);
          return reject(err);
        }

        //  load currently actual keys from the far-away mongodb
        db.collection(config.service.key_id.collection)
          .findOne({
            deleted: false
          }, {
            _id: 0,
            sdk_key: 1,
            account_id: 1
          }, function(err, rec) {

            // {
            //   "account_id" : "55b6ff6a7957012304a49d04",
            //   "sdk_key" : "3185ae13-5932-43d1-889d-05b77d2547f9"
            // }

            db.close();

            if (err) {
              logger.error(err);
              return reject(err);
            }
            resolve(rec);
          });
      });
    });
  },

};
