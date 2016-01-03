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
var cluster = require('cluster');
var queue_ = {};

//  ----------------------------------------------------------------------------------------------//
//  master

if (cluster.isMaster) {

  module.exports = {

    // should be invoked _only_ after master process has forked all children
    init: function() {

      var handler_ = function(msg) {
        for (var id in cluster.workers) {
          var w_ = cluster.workers[id];
          if (w_.process.pid !== msg.from) {
            w_.send(msg);
          }
        }
      };

      for (var id in cluster.workers) {
        cluster.workers[id].on('message', handler_);
      }
    },

    on: function() { /*dummy*/ }
  };


  //  ----------------------------------------------------------------------------------------------//
  //  worker

} else {

  process.on('message', function(msg) {
    if (queue_[msg.type]) {
      for (var i = 0, len = queue_[msg.type].length; i < len; ++i) {
        queue_[msg.type][i].call(null, msg);
      }
    }
  });

  module.exports = {

    //  broadcast msg to all forked processes
    //  msg supposed to be object, string or nothing
    broadcast: function(type, msg) {
      msg = msg || {};
      if (_.isString(msg)) {
        msg = {
          message: msg
        };
      }
      msg.type = type || '*';
      msg.from = process.pid;
      process.send(msg);
    },

    on: function(type, cb) {
      if (!queue_[type]) {
        queue_[type] = [];
      }
      queue_[type].push(cb);
    }

  };

}
