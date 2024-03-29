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
var elastic = require('elasticsearch');
var url = require('url');

var jgeoip = require('jgeoip');
var geo = new jgeoip(__dirname + '/../geo_db/GeoLite2-City.mmdb');
//  IPv4-mapped-to-IPv6 address
var regex4map6_ = /^\:\:ffff\:(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

var metrics = require('./metrics.js');
var keys = require('./keys.js');

//  ---------------------------------
var client_ = false;
var client_url_ = false;

//  full message queue, to ESURL cluster
var msg_queue_ = [];
//  short message queue, to ES cluster
var sht_queue_ = [];
var being_sent_ = 0;
var been_sent_ = 0;

var last_fired_ = 0;
var queue_cleaner_ = null;

//  ---------------------------------
// {
//   "method": "GET",
//   "end_ts": 1451291053,
//   "protocol": "-",
//   "transport_protocol": "https",
//   "status_code": 200,
//   "conn_id": 11,
//   "url": "https://rev-200.revdn.net/get",
//   "start_ts": 1451291053,
//   "cont_encoding": "gzip",
//   "keepalive_status": 1,
//   "sent_bytes": 0,
//   "first_byte_ts": 1451291053,
//   "success_status": 200,
//   "cont_type": "application/json",
//   "local_cache_status": "-",
//   "network": "-",
//   "received_bytes": 537
// }

//  ---------------------------------
var init_ = function() {

  client_ = new elastic.Client(config.service.elastic_es);
  client_url_ = new elastic.Client(config.service.elastic_esurl);

  queue_cleaner_ = setInterval(function() {
    //  if non-empty queue stays too long without move - fire it even if it not full
    if (msg_queue_.length > 0) {
      if ( (Date.now() - last_fired_) > config.service.queue_clear_timeout) {
        logger.info('Dispatcher\'s queue_cleaner_: queue timed out, fire, ' + (msg_queue_.length / 2));
        fire_queue_();
      } else {
        logger.debug('Dispatcher\'s queue_cleaner_: queue is not yet timed out, ' + (Date.now() - last_fired_) );
      }
    } else {
      logger.debug('Dispatcher\'s queue_cleaner_: queue is empty');
    }
  }, config.service.queue_clear_timeout);
  logger.info('Dispatcher initialized');
};

//  ---------------------------------
//  index name from a date
var get_index_ = function(timestamp) {
  var d = new Date(timestamp);
  return config.service.index_prefix + d.getUTCFullYear() + '.' +
    ('0' + (d.getUTCMonth() + 1)).slice(-2) + '.' +
    ('0' + d.getUTCDate()).slice(-2);
};

//  ---------------------------------
//  handle requests, filter and collect start/end data
var handle_requests_ = function( msg ) {
  var index_date;
  var now = Date.now();
  msg.hits = msg.requests.length;
  if ( msg.hits ) {
    msg.start_ts = now;
    msg.end_ts = 0;
    for ( var i = 0; i < msg.hits; ++i ) {
      if ( msg.requests[i].start_ts !== 0 && msg.requests[i].start_ts < msg.start_ts ) {
        msg.start_ts = msg.requests[i].start_ts;
      }
      if ( msg.requests[i].end_ts !== 0 && msg.requests[i].end_ts > msg.end_ts ) {
        msg.end_ts = msg.requests[i].end_ts;
      }
      //  parse request's url to domain
      msg.requests[i].domain = url.parse( ( msg.requests[i].url || '' ) ).hostname || '';
      //  convert end and first_byte abs timestamps to relative to start
      msg.requests[i].end_ts -= msg.requests[i].start_ts;
      msg.requests[i].first_byte_ts -= msg.requests[i].start_ts;
    }

    index_date = msg.start_ts;
    var err = false;
    if ( now === msg.start_ts ) {
      err = 'Dispatcher::handle_requests_: requests have no correct start_ts data, won\'t be stored';
    } else if ( now - msg.start_ts > config.service.request_max_age ) {
      err = 'Dispatcher::handle_requests_: requests are way too old, won\'t be stored';
    }
    if ( err ) {
      logger.warn( err );
      msg.requests = [];
      msg.hits = 0;
      index_date = now;
    }
  } else {
    msg.start_ts = msg.end_ts = now;
    index_date = now;
  }
  return index_date;
};

//  ---------------------------------
var device_dict_ = {
  'iPad1,1': 'iPad',
  'iPad2,1': 'iPad 2',
  'iPad2,2': 'iPad 2',
  'iPad2,3': 'iPad 2',
  'iPad2,4': 'iPad 2',
  'iPad3,1': 'iPad 3',
  'iPad3,2': 'iPad 3',
  'iPad3,3': 'iPad 3',
  'iPad3,4': 'iPad 4',
  'iPad3,5': 'iPad 4',
  'iPad3,6': 'iPad 4',
  'iPad4,1': 'iPad Air',
  'iPad4,2': 'iPad Air',
  'iPad4,3': 'iPad Air',
  'iPad5,3': 'iPad Air 2',
  'iPad5,4': 'iPad Air 2',
  'iPad6,7': 'iPad Pro',
  'iPad6,8': 'iPad Pro',
  'iPad2,5':'iPad mini',
  'iPad2,6':'iPad mini',
  'iPad2,7':'iPad mini',
  'iPad4,4':'iPad mini 2',
  'iPad4,5':'iPad mini 2',
  'iPad4,6':'iPad mini 2',
  'iPad4,7':'iPad mini 3',
  'iPad4,8':'iPad mini 3',
  'iPad4,9':'iPad mini 3',
  'iPad5,1':'iPad mini 4',
  'iPad5,2':'iPad mini 4',
  'iPhone1,1':'iPhone',
  'iPhone1,2':'iPhone 3G',
  'iPhone2,1':'iPhone 3GS',
  'iPhone3,1':'iPhone 4',
  'iPhone3,2':'iPhone 4',
  'iPhone3,3':'iPhone 4',
  'iPhone4,1':'iPhone 4S',
  'iPhone5,1':'iPhone 5',
  'iPhone5,2':'iPhone 5',
  'iPhone5,3':'iPhone 5c',
  'iPhone5,4':'iPhone 5c',
  'iPhone6,1':'iPhone 5s',
  'iPhone6,2':'iPhone 5s',
  'iPhone7,2':'iPhone 6',
  'iPhone7,1':'iPhone 6 Plus',
  'iPhone8,1':'iPhone 6s',
  'iPhone8,2':'iPhone 6s Plus',
  'iPod1,1':'iPod touch',
  'iPod2,1':'iPod touch 2G',
  'iPod3,1':'iPod touch 3G',
  'iPod4,1':'iPod touch 4G',
  'iPod5,1':'iPod touch 5G',
  'iPod7,1':'iPod touch 6G'
};


//  ---------------------------------
//  push the message to the 2 queues
var push_ = function(msg) {

  if (msg.version === undefined ||
    msg.sdk_version === undefined ||
    msg.received_at === undefined ||
    msg.app_id === undefined ||
    msg.sdk_key === undefined ||
    msg.account_id === undefined ||
    msg.ip === undefined ||
    msg.geoip === undefined ||
    msg.log_events === undefined ||
    msg.location === undefined ||
    msg.requests === undefined ||
    msg.device === undefined) {
    logger.error('Dispatcher::push_: message pushing error - wrong data format', msg);
    return false;
  }

  //  store full msg
  var idx = get_index_( handle_requests_( msg ) );
  msg.device.model = device_dict_[(msg.device.device.split(' ')[0])] || msg.device.device;
  msg_queue_.push({
    index: {
      _index: idx
    }
  });
  msg_queue_.push(msg);

  // debug
  logger.debug('message just pushed to queue: ', msg);
  // debug

  //  short message from the full one
  var short_msg = _.pick(msg, ['version', 'sdk_version', 'received_at', 'app_id', 'sdk_key',
    'account_id', 'ip', 'geoip', 'log_events', 'location', 'hits', 'start_ts', 'end_ts' ]);

  short_msg.device = (msg.device.device || '');
  short_msg.model = msg.device.model;
  short_msg.serial_number = (msg.device.serial_number || '');
  short_msg.uuid = (msg.device.uuid || '');

  short_msg.requests = _.map(msg.requests, function(item) {
    return _.pick(item, 'method', 'start_ts', 'end_ts', 'status_code', 'conn_id',
      'keepalive_status', 'sent_bytes', 'received_bytes', 'first_byte_ts');
  });

  sht_queue_.push({
    index: {
      _index: idx
    }
  });
  sht_queue_.push(short_msg);
  return true;
};

//  ---------------------------------
//  upload one time one portion of data(full queue)
var fire_once_ = function(shot, full) {

  return (full ? client_url_ : client_).bulk(shot.req)
    .then(function() {
      //  job is done
      shot.tries = 0;
    })
    .catch(function(err) {
      //  shit happened
      logger.error(err);
      metrics.addMetric('esErrors');
      if (--shot.tries) {
        //  tries still remain, delay then fire again
        return promise.delay(config.service.send_tries_timeout);
      }
      //  fucked up totally
      throw err;
    })
    .then(function() {
      //  we can get here from the above "then" or the above "catch"
      if (shot.tries) {
        //  not yet done, again
        return fire_once_(shot, full);
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
  last_fired_ = now;
  logger.info('Dispatcher: request is being sent, ' + being_sent_);

  return promise.all([
      fire_once_(shot, true),
      fire_once_(short_shot, false)
    ])
    .then(function() {

      //  process metrics
      var now = Date.now(),
        min_ = 1000000,
        max_ = 0,
        total = 0;

      for (var i = 1, count = shot.req.body.length; i < count; i += 2) {
        var t = now - shot.req.body[i].received_at;
        if (t > max_) {
          max_ = t;
        }
        if (t < min_) {
          min_ = t;
        }
        total += t;
      }
      metrics.updateProcessing(count / 2, min_, max_, total);
      return loose_queue_();
    })
    .catch(function(err) {
      logger.warn('Dispatcher: request is fucked up completely', err);
      return loose_queue_();
    })
    .finally(function() {
      logger.info('Dispatcher: request is finished, ' + being_sent_);
    });
};

//  ---------------------------------
//  decrement the active requests number, and if there just was overload - loose the current queue
var loose_queue_ = function() {
  if (being_sent_-- >= config.service.max_requests &&
    msg_queue_.length >= config.service.upload_size * 2) {
    //  it was overloaded one tick ago - too many requests were being sent and current queue was full
    return fire_queue_();
  }
  return false;
};

//  ----------------------------------------------------------------------------------------------//
module.exports = {

  init: function() {
    if (!client_) {
      //  first run - init clients
      init_();
    }
  },

  queueSize: function() {
    return msg_queue_.length / 2;
  },

  beingSent: function() {
    return being_sent_;
  },

  beenSent: function() {
    return been_sent_;
  },

  indexName: function(ts) {
    return get_index_(ts);
  },

  //  ---------------------------------
  //  main thing - dispatch message
  handle: function(message) {

    if (!client_) {
      //  first run - init clients
      init_();
    }

    metrics.addMetric('count');
    message.received_at = Date.now();

    //  check provided SDK key
    return keys.getAccountAppIDs(message.sdk_key)
      .then(function(ids) {
        if (!ids) {
          logger.warn('SDK_KEY not found, 401, ip: ' + message.ip + ', key: ' + message.sdk_key);
          return promise.reject({ code: 401, msg: 'Not authorized' });
        }
        message.account_id = ids.account_id;
        message.app_id = ids.app_id || '';

        //  ip --> geo position
        try {
          if ( regex4map6_.test(message.ip) ) {
            message.ip = message.ip.slice(7);
          }
          var geoip = geo.getRecord(message.ip);
          if (geoip) {
            geoip = {
              country_code2: geoip.country.iso_code,
              region_name: ((geoip.subdivisions && geoip.subdivisions[0] && geoip.subdivisions[0].iso_code) || ''),
              city_name: ((geoip.city && geoip.city.names && geoip.city.names.en) || '')
            };
          } else {
            logger.warn( 'ip: ' + message.ip + ', geo data not found.' );
          }
        } catch (e) {
          logger.warn('ip: ' + message.ip, e.message);
          // metrics.addMetric( 'errors' );
        }

        message.geoip = geoip || {
          country_code2: '',
          region_name: '',
          city_name: ''
        };

        //  handling msg and queue
        if (msg_queue_.length < config.service.upload_size * 2) {
          //  queue is not full
          return ( push_(message) ? true : promise.reject({ code: 400, msg: 'Bad request: wrong data format' }) );
        }

        //  well, current queue IS full
        if (being_sent_ < config.service.max_requests) {
          //  not too many requests are being sent - add the current queue to them
          fire_queue_();
          //  here the current queue is empty and shining
          return ( push_(message) ? true : promise.reject({ code: 400, msg: 'Bad request: wrong data format' }) );
        }

        //  BUMMER! overload: too many requests are being sent and queue is full
        metrics.addMetric('queueErrors');
        //  do nothing actually and return true anyway
        return true;
      });
  },

  //  ---------------------------------
  //  check if ES clusters up and running
  healthCheck: function() {

    if (!client_) {
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
      .then(function(answers) {
        if (answers[0].status === 'red' || answers[1].status === 'red') {
          throw new Error('ES cluster in RED state.');
        }
      })
      .catch(function(err) {
        metrics.addMetric('esErrors');
        logger.error(err);
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
