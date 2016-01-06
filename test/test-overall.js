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
var config = require('config');
var promise = require('bluebird');
var request = promise.promisify(require('request'));
var elastic = require('elasticsearch');

var keys = require('../lib/keys.js');
var dispatcher = require('../lib/dispatcher.js');


//  ----------------------------------------------------------------------------------------------//
var check_access_ = function() {
  return request({
      url: config.testing.server,
      method: 'GET',
      tunnel: false,
      strictSSL: false, // self signed certs used
      headers: {
        'User-Agent': 'nodejs',
      },
      followRedirect: false,
      timeout: 15000
    })
    .catch(function(err) {
      console.log('        connection error with the StatsAPI service, url ' + config.testing.server);
      console.log('        It should be running and properly configured');
      throw err;
    })
    .then(function() {
      return request({
        url: config.testing.api.server,
        method: 'GET',
        tunnel: false,
        strictSSL: false, // self signed certs used
        headers: {
          'User-Agent': 'nodejs',
        },
        followRedirect: false,
        timeout: 15000
      });
    })
    .catch(function(err) {
      console.log('        connection error with the API service, url ' + config.testing.server);
      console.log('        It should be running and properly configured');
      throw err;
    })
};

//  ---------------------------------
var create_app_ = function() {

  return request({
      url: config.testing.api.server + '/v1/apps',
      method: 'POST',
      tunnel: false,
      strictSSL: false, // self signed certs used
      headers: {
        'User-Agent': 'nodejs',
        'Authorization': 'Basic ' +
          new Buffer(config.testing.api.user + ':' + config.testing.api.password).toString('base64')
      },
      followRedirect: false,
      timeout: 15000,
      json: true,
      body: {
        account_id: config.testing.api.account_id,
        app_name: ('fake-testing-app-0' + (Math.floor(Math.random() * 900) + 100)),
        app_platform: 'Android'
      }
    })
    .then(function(data) {
      if (data.statusCode !== 200) {
        throw new Error(data.body);
      }
      return data.body;
    });
};

//  ---------------------------------
var delete_app_ = function(aid) {

  return request({
      url: config.testing.api.server + '/v1/apps/' + aid,
      method: 'DELETE',
      tunnel: false,
      strictSSL: false, // self signed certs used
      headers: {
        'User-Agent': 'nodejs',
        'Authorization': 'Basic ' +
          new Buffer(config.testing.api.user + ':' + config.testing.api.password).toString('base64')
      },
      followRedirect: false,
      timeout: 15000,
      json: true
    })
    .then(function(data) {
      return data.body;
    });
};

//  ---------------------------------
var force_keys_reload_ = function() {
  return request({
    url: (config.testing.server + '/v' + config.api.version + '/force-keys-reload'),
    method: 'POST',
    tunnel: false,
    strictSSL: false, // self signed certs used
    headers: {
      'User-Agent': 'nodejs',
    },
    followRedirect: false,
    timeout: 15000
  });
};

//  ---------------------------------
var force_fire_queue_ = function() {
  return request({
    url: (config.testing.server + '/v' + config.api.version + '/force-fire-queue'),
    method: 'POST',
    tunnel: false,
    strictSSL: false, // self signed certs used
    headers: {
      'User-Agent': 'nodejs',
    },
    followRedirect: false,
    timeout: 15000
  });
};

//  ---------------------------------
var get_sdk_count_ = function() {
  return request({
    url: config.testing.api.server + '/v1/stats/sdk/app/' + key_.app_id + '?from_timestamp=-1h&to_timestamp=' + (Date.now() + 1800000),
    method: 'GET',
    tunnel: false,
    strictSSL: false, // self signed certs used
    headers: {
      'User-Agent': 'nodejs',
      'Authorization': 'Basic ' +
        new Buffer(config.testing.api.user + ':' + config.testing.api.password).toString('base64')
    },
    followRedirect: false,
    timeout: 15000,
  }).then(function(data) {
    return JSON.parse(data.body);
  });
}


//  ---------------------------------
var one_record_ = {
  version: '1.0',
  sdk_version: '1.0',
  log_events: {
    log_severity: '_',
    log_event_code: '0',
    log_interval: '1.0',
    log_message: '_'
  },
  carrier: {
    country_code: '_',
    sim_operator: '_',
    mcc: '_',
    tower_cell_id_l: '_',
    signal_type: '_',
    mnc: '_',
    rssi_avg: '1.0',
    device_id: '_',
    phone_type: '_',
    net_operator: '_',
    rssi: '1.0',
    rssi_best: '1.0',
    tower_cell_id_s: '_',
    network_type: '_'
  },
  network: {
    ip_total_bytes_in: '0',
    rtt: '0',
    tcp_bytes_out: '0',
    udp_bytes_in: '0',
    wifi_qw: '_',
    ip_reassemblies: '0',
    wifi_ip: '1.0',
    tcp_bytes_in: '0',
    ip_total_bytes_out: '0',
    transport_protocol: '_',
    wifi_extip: '_',
    ip_total_packets_in: '0',
    dns1: '_',
    udp_bytes_out: '0',
    cellular_ip_external: '8.8.8.8',
    tcp_retransmits: '0',
    wifi_dhcp: '_',
    wifi_mask: '_',
    dns2: '_',
    ip_total_packets_out: '0',
    cellular_ip_internal: '_'
  },
  wifi: {
    ssid: '_',
    wifi_speed: '_',
    mac: '_',
    wifi_rssi: '_',
    wifi_freq: '_',
    wifi_rssibest: '_',
    wifi_enc: '_',
    wifi_sig: '_'
  },
  location: {
    longitude: 0,
    direction: -1,
    latitude: 0,
    speed: -1
  },
  requests: [{
    method: 'GET',
    end_ts: 1451291053,
    protocol: '-',
    transport_protocol: 'https',
    status_code: 200,
    conn_id: 11,
    url: 'https://rev-200.revdn.net/get',
    start_ts: 1451291053,
    cont_encoding: 'gzip',
    keepalive_status: 1,
    sent_bytes: 0,
    first_byte_ts: 1451291053,
    success_status: 200,
    cont_type: 'application/json',
    local_cache_status: '-',
    network: '-',
    received_bytes: 537
  }, {
    method: 'GET',
    end_ts: 1451291059,
    protocol: '-',
    transport_protocol: 'https',
    status_code: 200,
    conn_id: 15,
    url: 'https://rev-200.revdn.net/get',
    start_ts: 1451291059,
    cont_encoding: 'gzip',
    keepalive_status: 1,
    sent_bytes: 0,
    first_byte_ts: 1451291059,
    success_status: 200,
    cont_type: 'application/json',
    local_cache_status: '-',
    network: '-',
    received_bytes: 537
  }, {
    method: 'GET',
    end_ts: 1451291062,
    protocol: '-',
    transport_protocol: 'https',
    status_code: 200,
    conn_id: 17,
    url: 'https://rev-200.revdn.net/get',
    start_ts: 1451291061,
    cont_encoding: 'gzip',
    keepalive_status: 1,
    sent_bytes: 0,
    first_byte_ts: 1451291061,
    success_status: 200,
    cont_type: 'application/json',
    local_cache_status: '-',
    network: '-',
    received_bytes: 537
  }, {
    method: 'GET',
    end_ts: 1451291065,
    protocol: '-',
    transport_protocol: 'https',
    status_code: 200,
    conn_id: 19,
    url: 'https://rev-200.revdn.net/get',
    start_ts: 1451291064,
    cont_encoding: 'gzip',
    keepalive_status: 1,
    sent_bytes: 0,
    first_byte_ts: 1451291064,
    success_status: 200,
    cont_type: 'application/json',
    local_cache_status: '-',
    network: '-',
    received_bytes: 537
  }],
  device: {
    batt_temp: '_',
    cpu_cores: '0',
    imei: '_',
    radio_serial: '_',
    batt_volt: '_',
    serial_number: '_',
    device: 'x86_64',
    cpu: '_',
    brand: '_',
    uuid: 'D1311278-CA9E-4849-BA15-313734CB028D',
    batt_status: 'unknown',
    width: '320.000000',
    cpu_number: '1.0',
    os: '9.1',
    batt_cap: -100,
    iccid: '_',
    hight: '568.000000',
    batt_tech: 'Li-Ion',
    phone_number: '1.0',
    meis: '_',
    cpu_sub: '0',
    cpu_freq: '_',
    imsi: '_',
    manufacture: 'Apple'
  }
};
var ill_formed_record_ = {
  version: '1.0',
  carrier: {
    country_code: '_',
    sim_operator: '_',
    mcc: '_',
    tower_cell_id_l: '_',
    signal_type: '_',
    mnc: '_',
    rssi_avg: '1.0',
    device_id: '_',
    phone_type: '_',
    net_operator: '_',
    rssi: '1.0',
    rssi_best: '1.0',
    tower_cell_id_s: '_',
    network_type: '_'
  },
  location: {
    longitude: 0,
    direction: -1,
    latitude: 0,
    speed: -1
  },
  device: {
    batt_temp: '_',
    cpu_cores: '0',
    imei: '_',
    radio_serial: '_',
    batt_volt: '_',
    serial_number: '_',
    device: 'x86_64',
    cpu: '_',
    brand: '_',
    uuid: 'D1311278-CA9E-4849-BA15-313734CB028D',
    batt_status: 'unknown',
    width: '320.000000',
    cpu_number: '1.0',
    os: '9.1',
    batt_cap: -100,
    iccid: '_',
    hight: '568.000000',
    batt_tech: 'Li-Ion',
    phone_number: '1.0',
    meis: '_',
    cpu_sub: '0',
    cpu_freq: '_',
    imsi: '_',
    manufacture: 'Apple'
  }
};

var ip_ = '8.8.8.8';
var geo_ = {
  country_code2: 'US',
  region_name: 'CA',
  city_name: 'Mountain View'
};

var key_ = {
  account_id: config.testing.api.account_id
};
var now_ = Date.now();
var idx_ = dispatcher.indexName(now_);
var client_;
var client_url_;


//  ---------------------------------
var fire1_ = function(rec) {

  return request({
      url: (config.testing.server + '/v' + config.api.version + '/' + config.api.main_endpoint + '/apps'),
      method: 'POST',
      json: true,
      body: rec,
      tunnel: false,
      strictSSL: false, // self signed certs used
      headers: {
        'User-Agent': 'nodejs',
        'x-forwarded-for': ip_
      },
      followRedirect: false,
      timeout: 15000
    })
    .then(function(data) {
      return data.body;
    })
};

//  ---------------------------------
var fire_ = function(num, rec) {

  var dummy = [];
  dummy.length = num /*stupid hack*/ ;
  return promise.map(dummy, function() {
    return fire1_(rec);
  }, {
    concurrency: 50
  });
};


//  ---------------------------------
var load1_ = function(url) {
  return (url ? client_url_ : client_).search({
      index: idx_,
      body: {
        query: {
          filtered: {
            filter: {
              term: {
                app_id: key_.app_id
              }
            }
          }
        },
        size: 1
      }
    })
    .then(function(data) {
      if (data.hits.total === 0) {
        throw new Error('Records not found for the application ID ' + key_.app_id);
      }
      var item = data.hits.hits[0]._source;
      return {
        ip: item.ip,
        geoip: item.geoip,
        sdk_key: item.sdk_key,
        app_id: item.app_id,
        account_id: item.account_id
      };
    });
};


//  ----------------------------------------------------------------------------------------------//


//  here we go
describe('Rev SDK stats API, overall testing', function() {

  this.timeout(60000);
  var suite_init = false;

  //  ---------------------------------
  before(function(done) {

    console.log('    ### accessibility check');
    check_access_()
      .then(function() {
        console.log('    ### app creation');
        return create_app_();
      })
      .then(function(data) {
        console.log('    ### app_id ' + data.id);
        console.log('    ### sdk_key ' + data.sdk_key);
        key_.app_id = data.id;
        key_.sdk_key = data.sdk_key;
        one_record_.sdk_key = data.sdk_key;
        ill_formed_record_.sdk_key = data.sdk_key;
        console.log('    ### init ES interface');
        //  "Do not reuse objects to configure the elasticsearch" ... sigh
        var es = {
          host: config.service.elastic_es.host,
          requestTimeout: 60000,
          log: [{
            'type': 'stdio',
            'levels': ['error', 'warning']
          }]
        };
        client_ = new elastic.Client(es);
        var esurl = {
          host: config.service.elastic_esurl.host,
          requestTimeout: 60000,
          log: [{
            'type': 'stdio',
            'levels': ['error', 'warning']
          }]
        };
        client_url_ = new elastic.Client(esurl);

        console.log('    ### wait for the app keys to be reloaded, ' + config.service.key_id.poll_interval + 'ms');
      })
      .delay(config.service.key_id.poll_interval)
      .then(function() {
        console.log('        "before" hook done');
        suite_init = true;
        done();
      })
      .catch(function(err) {
        console.log('        ' + err.toString());
        done(err);
      });
  });

  //  ---------------------------------
  after(function(done) {

    if (!suite_init) {
      return done();
    }

    console.log('    ### clearing');
    delete_app_(key_.app_id)
      .then(function() {
        console.log('        "after" hook done');
        done();
      })
      .catch(function(err) {
        console.log('        ' + err.toString());
        done(err);
      });
  });

  //  ---------------------------------
  it('should properly process incoming messages with the new SDK key', function(done) {

    var N = config.testing.small_msg_amount;
    console.log('    ### ' + N + ' messages');
    fire_(N, one_record_)
      .then(function() {
        console.log('    ### processed, wait for the queue to be fired, ' + config.service.queue_clear_timeout + 'ms');
      })
      .delay(config.service.queue_clear_timeout)
      .then(function() {
        console.log('    ### done');
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  //  ---------------------------------
  it('should properly process yet another incoming messages with the new SDK key', function(done) {

    var N = config.testing.big_msg_amount;
    console.log('    ### ' + N + ' messages');
    fire_(N, one_record_)
      .then(function() {
        console.log('    ### processed, wait for the queue to be fired, 2*' + config.service.queue_clear_timeout + 'ms');
      })
      .delay(config.service.queue_clear_timeout * 2)
      .then(function() {
        console.log('    ### done');
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  //  ---------------------------------
  it('should show correct amount of messages stored in the ES', function(done) {

    get_sdk_count_()
      .then(function(data) {
        console.log('    ### gotcha, ' + data.data.hits + ' messages');
        data.data.hits.should.be.equal(config.testing.small_msg_amount + config.testing.big_msg_amount);
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  //  ---------------------------------
  it('should contain correctly added data (app_id, ip, geoip and account_id) in the saved messages', function(done) {

    promise.all([
        load1_(false /*es*/ ),
        load1_(true /*esurl*/ )
      ])
      .then(function(data) {
        data[0].geoip.country_code2.should.be.equal(geo_.country_code2);
        data[0].geoip.region_name.should.be.equal(geo_.region_name);
        data[0].geoip.city_name.should.be.equal(geo_.city_name);
        data[1].geoip.country_code2.should.be.equal(geo_.country_code2);
        data[1].geoip.region_name.should.be.equal(geo_.region_name);
        data[1].geoip.city_name.should.be.equal(geo_.city_name);

        data[0].account_id.should.be.equal(key_.account_id);
        data[1].account_id.should.be.equal(key_.account_id);

        data[0].app_id.should.be.equal(key_.app_id);
        data[1].app_id.should.be.equal(key_.app_id);

        data[0].ip.should.be.equal(ip_);
        data[1].ip.should.be.equal(ip_);
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  //  ---------------------------------
  it('should refuse to process ill-formed messages', function(done) {

    fire1_(ill_formed_record_)
      .then(function(data) {
        data.code.should.be.equal(400);
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  //  ---------------------------------
  it('should refuse to process messages with wrong sdk_key', function(done) {

    console.log('    ### about to remove the new app');
    delete_app_(key_.app_id)
      .then(function() {
        console.log('    ### app removed');
        console.log('    ### wait for the app keys to be reloaded, ' + config.service.key_id.poll_interval + 'ms');
      })
      .delay(config.service.key_id.poll_interval + 500)
      .then(function() {
        console.log('    ### the new sdk_key is no more valid, trying to fire record again');
        return fire1_(one_record_);
      })
      .then(function(data) {
        data.code.should.be.equal(401);
        console.log('    ### it refused as expected');
        done();
      })
      .catch(function(err) {
        console.log('     ' + err.toString());
        done(err);
      });
  });

});

