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
var promise = require( 'bluebird' );
var elastic = require('elasticsearch');

var metrics = require( './metrics.js' );

//  ---------------------------------
var client_ = false;
var client_url_ = false;

//  full message queue, to ESURL cluster
var msg_queue_ = [];
//  short message queue, to ES cluster
var sht_queue_ = [];
var being_sent_ = 0;
var been_sent_ = 0;

var last_call_ = 0;
var queue_cleaner_ = null;

//  ---------------------------------
var init_ = function() {

  client_ = new elastic.Client( config.service.elastic_es );
  client_url_ = new elastic.Client( config.service.elastic_esurl );

  queue_cleaner_ = setInterval( function() {
    //  if non-empty queue stays too long without move - fire it even if it not full
    if ( msg_queue_.length > 0 && ( Date.now() - last_call_ ) > config.service.queue_clear_timeout ) {
      logger.info( 'Dispatcher: queue timed out, fire, ' + ( msg_queue_.length / 2 ) );
      fire_queue_();
    }
  }, config.service.queue_clear_timeout );
};

//  ---------------------------------
//  index name from a date
var get_index_ = function( timestamp ) {
  var d = new Date( timestamp );
  return config.service.index_prefix + d.getUTCFullYear() + '.' +
    ('0' + (d.getUTCMonth() + 1)).slice(-2) + '.' +
    ('0' + d.getUTCDate()).slice(-2);
};

//  ---------------------------------
//  push the message to the 2 queues
var push_ = function( msg ) {

  var idx = get_index_( msg.log_events.timestamp || msg.received_at );
  msg_queue_.push({ index: { _index: idx } });
  msg_queue_.push( msg );

  //  short message from the full one
  var short_msg = {
    version: msg.version,
    received_at: msg.received_at,
    app_name: msg.app_name,
    app_id: msg.app_id,
    sdk_key: msg.sdk_key,
    sdk_version: msg.sdk_version,
    ip: msg.ip,
    geoip: msg.geoip,
    account_id: msg.account_id,
    log_events: msg.log_events,
    location: msg.location,
    requests: msg.requests,
    device: ( msg.device.device || '' ),
    serial_number: ( msg.device.serial_number || '' ),
    uuid: ( msg.device.uuid || '' )
  };

  sht_queue_.push({ index: { _index: idx } });
  sht_queue_.push( short_msg );
};

//  ---------------------------------
//  upload one time one portion of data(full queue)
var fire_once_ = function( shot, full ) {

  return ( full ? client_url_ : client_ ).bulk( shot.req )
    .then( function() {
      //  job is done
      shot.tries = 0;
    })
    .catch( function( err ) {
      //  shit happened
      logger.error( err );
      metrics.addMetric( 'esErrors' );
      if ( --shot.tries ) {
        //  tries still remain, delay then fire again
        return promise.delay( config.service.send_tries_timeout );
      }
      //  fucked up totally
      throw err;
    })
    .then( function() {
      //  we can get here from the above "then" or the above "catch"
      if ( shot.tries ) {
        //  not yet done, again
        return fire_once_( shot, full );
      }
    });
};

//  ---------------------------------
//  decorate the queue with metadata, prepare ES bulk request and invoke the fire_once_
var fire_queue_ = function() {

  var now = Date.now();
  var shot = {
    tries: config.service.send_tries_num,
    fired_at: now,
    req: {
      type: config.service.index_type,
      refresh: true,
      body: msg_queue_
    }
  };
  msg_queue_ = [];
  var short_shot = {
    tries: config.service.send_tries_num,
    fired_at: now,
    req: {
      type: config.service.index_type,
      refresh: true,
      body: sht_queue_
    }
  };
  sht_queue_ = [];

  ++being_sent_;
  ++been_sent_;
  logger.info( 'Dispatcher: request is being sent, ' + being_sent_ );

  return promise.all([
      fire_once_( shot, true ),
      fire_once_( short_shot, false )
    ])
    .then( function() {

      //  process metrics
      var now = Date.now(),
        min_ = 1000000,
        max_ = 0,
        total = 0;

      for ( var i = 1, count = shot.req.body.length; i < count; i += 2 ) {
          var t = now - shot.req.body[i].received_at;
          if ( t > max_ ) {
            max_ = t;
          }
          if ( t < min_ ) {
            min_ = t;
          }
          total += t;
      }
      metrics.updateProcessing( count / 2, min_, max_, total );
      return loose_queue_();
    })
    .catch( function( err ) {
      logger.warn( 'Dispatcher: request is fucked up completely', err );
      return loose_queue_();
    })
    .finally( function() {
      logger.info( 'Dispatcher: request is finished, ' + being_sent_ );
    });
};

//  ---------------------------------
//  decrement the active requests number, and if there just was overload - loose the current queue
var loose_queue_ = function() {
  if ( being_sent_-- >= config.service.max_requests &&
    msg_queue_.length >= config.service.upload_size * 2 ) {
      //  it was overloaded one tick ago - too many requests were being sent and current queue was full
    return fire_queue_();
  }
  return false;
};

//  ----------------------------------------------------------------------------------------------//
module.exports = {

  queueSize: function() {
    return msg_queue_.length / 2;
  },

  beingSent: function() {
    return being_sent_;
  },

  beenSent: function() {
    return been_sent_;
  },

  indexName: function( ts ) {
    return get_index_( ts );
  },

  //  main thing - dispatch message
  handle: function( message ) {

    if ( !client_ ) {
      //  first run - init clients
      init_();
    }

    metrics.addMetric( 'count' );

    last_call_ = Date.now();
    if ( msg_queue_.length < config.service.upload_size * 2 ) {
      //  queue is not full
      push_( message );
      return;
    }

    //  well, current queue IS full
    if ( being_sent_ < config.service.max_requests ) {
      //  not too many requests are being sent - add the current queue to them
      fire_queue_();
      //  here the current queue is empty and shining
      push_( message );
      return;
    }

    //  BUMMER! overload: too many requests are being sent and queue is full
    metrics.addMetric( 'queueErrors' );
    //  do nothing actually
    return;
  },

  //  check if ES clusters up and running
  healthCheck: function() {

    if ( !client_ ) {
      init_();
    }

    //
    // {
    // "cluster_name" : "elasticsearch",
    // "status" : "green",
    //  ...
    // }

    return promise.all([
        client_.cluster.health(),
        client_url_.cluster.health(),
      ])
      .then( function( answers ) {
        if ( answers[0].status === 'red' || answers[1].status === 'red' ) {
          throw new Error( 'ES cluster in RED state.' );
        }
      })
      .catch( function( err ) {
        metrics.addMetric( 'esErrors' );
        logger.error( err );
        throw err;
      });
  },

  // forcibly fire queued messages, mainly for testing/debuggin purposes
  forceFireQueue: function() {
    return msg_queue_.length === 0 ?
      promise.resolve() :
      fire_queue_();
  }
};

//  ----------------------------------------------------------------------------------------------//

/*

Rev Mobile SDK Product Low Level Design
https://docs.google.com/document/d/12Du_bkTDvJoBSC_G8mt8HojAVRqaIwamGWaiA0xd0MI/edit#heading=h.i9ef3ibgertu
full structure of message
{
  "version": "1.0",
  "app_name": "testapp",
  "sdk_key": "testapp-001",
  "sdk_version": "1.0",
  "carrier": {
    "country_code": "-",
    "device_id": "-",
    "mcc": "-",
    "mnc": "-",
    "net_operator": "-",
    "network_type": "-",
    "phone_type": "-",
    "rssi": 1.0,
    "rssi_avg": 1.0,
    "rssi_best": 1.0,
    "signal_type": "-",
    "sim_operator": "-",
    "tower_cell_id_l": "-",
    "tower_cell_id_s": "-"
  },
  "device": {
    "batt_cap": 1.0,
    "batt_status": "-",
    "batt_tech": "-",
    "batt_temp": "-",
    "batt_volt": "-",
    "brand": "-",
    "cpu": "-",
    "cpu_cores": 0,
    "cpu_freq": "-",
    "cpu_number": 1.0,
    "cpu_sub": 0,
    "device": "-",
    "hight": 1.0,
    "iccid": "-",
    "imei": "-",
    "imsi": "-",
    "manufacture": "-",
    "meis": "-",
    "os": "-",
    "phone_number": 1.0,
    "radio_serial": "-",
    "serial_number": "-",
    "uuid": "-",
    "width": 1.0
  },
  "log_events": {
    "log_severity": "-",
    "log_event_code": 0,
    "log_message": "-",
    "log_interval": 1.0,
    "timestamp": 1.0
  },
  "location": {
    "direction": 1.0,
    "latitude": 1.0,
    "longitude": 1.0,
    "speed": 1.0
  },
  "network": {
    "cellular_ip_external": "-",
    "cellular_ip_internal": "-",
    "dns1": "-",
    "dns2": "-",
    "ip_reassemblies": 0,
    "ip_total_bytes_in": 0,
    "ip_total_bytes_out": 0,
    "ip_total_packets_in": 0,
    "ip_total_packets_out": 0,
    "rtt": 0,
    "tcp_bytes_in": 0,
    "tcp_bytes_out": 0,
    "tcp_retransmits": 0,
    "transport_protocol": "-",
    "udp_bytes_in": 0,
    "udp_bytes_out": 0,
    "wifi_dhcp": "-",
    "wifi_extip": "-",
    "wifi_gw": "-",
    "wifi_ip": "-",
    "wifi_mask": "-"
  },
  "requests": [ {
    "conn_id": 0,
    "cont_encoding": "-",
    "cont_type": "-",
    "end_ts": 0,
    "first_byte_ts": 0,
    "keepalive_status": 0,
    "local_cache_status": "-",
    "method": "-",
    "network": "-",
    "protocol": "-",
    "received_bytes": 0,
    "sent_bytes": 0,
    "start_ts": 0,
    "status_code": 0,
    "success_status": 0,
    "transport_protocol": "-",
    "url:": "request"
  } ],
  "wifi": {
    "mac": "-",
    "ssid": "-",
    "wifi_enc": "-",
    "wifi_freq": "-",
    "wifi_rssi": "-",
    "wifi_rssibest": "-",
    "wifi_sig": "-",
    "wifi_speed": "-"
  }
}

*/