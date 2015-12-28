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
var request = promise.promisify( require( 'request' ) );

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
    });
};

//  ---------------------------------
var create_app_ = function( name ) {

  return request({
    url: config.testing.api.server + '/v1/apps',
    method: 'POST',
    tunnel: false,
    strictSSL: false, // self signed certs used
    headers: {
      'User-Agent': 'nodejs',
      'Authorization': 'Basic ' +
        new Buffer( config.testing.api.user + ':' + config.testing.api.password ).toString( 'base64' )
    },
    followRedirect: false,
    timeout: 15000,
    json: true,
    body: {
      "account_id": config.testing.api.account_id,
      "app_name": name,
      "app_platform": "Android"
    }
  })
  .then( function( data ) {
    if ( data.statusCode !== 200 ) {
      throw data.body;
    }
    return data.body;
  });
};

//  ---------------------------------
var delete_app_ = function( aid ) {

  return request({
    url: config.testing.api.server + '/v1/apps/' + aid,
    method: 'DELETE',
    tunnel: false,
    strictSSL: false, // self signed certs used
    headers: {
      'User-Agent': 'nodejs',
      'Authorization': 'Basic ' +
        new Buffer( config.testing.api.user + ':' + config.testing.api.password ).toString( 'base64' )
    },
    followRedirect: false,
    timeout: 15000,
    json: true
  })
  .then( function( data ) {
    if ( data.statusCode !== 200 ) {
      throw data.body;
    }
    return data.body;
  });
};

//  ---------------------------------
var force_keys_reload_ = function() {
  return request({
      url: ( config.testing.server + '/v' + config.api.version + '/force-keys-reload' ),
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
      url: ( config.testing.server + '/v' + config.api.version + '/force-fire-queue' ),
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
    url: config.testing.api.server + '/v1/stats/sdk/app/' + key_.id + '?from_timestamp=-1h&to_timestamp=' + ( Date.now() + 1800000 ),
    method: 'GET',
    tunnel: false,
    strictSSL: false, // self signed certs used
    headers: {
      'User-Agent': 'nodejs',
      'Authorization': 'Basic ' +
        new Buffer( config.testing.api.user + ':' + config.testing.api.password ).toString( 'base64' )
    },
    followRedirect: false,
    timeout: 15000,
  }).then( function( data ) {
    return JSON.parse( data.body );
  });
}


//  ---------------------------------
var one_record_ = {
  version: '1.0',
  app_name: ( 'overall-test-app-0' + Math.floor( Math.random() * 900 + 100 ) ),
  sdk_version: '1.0',
  carrier: {
    country_code: '-',
    device_id: '-',
    mcc: '-',
    mnc: '-',
    net_operator: '-',
    network_type: '-',
    phone_type: '-',
    rssi: 1.0,
    rssi_avg: 1.0,
    rssi_best: 1.0,
    signal_type: '-',
    sim_operator: '-',
    tower_cell_id_l: '-',
    tower_cell_id_s: '-'
  },
  device: {
    batt_cap: 1.0,
    batt_status: '-',
    batt_tech: '-',
    batt_temp: '-',
    batt_volt: '-',
    brand: '-',
    cpu: '-',
    cpu_cores: 0,
    cpu_freq: '-',
    cpu_number: 1.0,
    cpu_sub: 0,
    device: '-',
    hight: 1.0,
    iccid: '-',
    imei: '-',
    imsi: '-',
    manufacture: '-',
    meis: '-',
    os: '-',
    phone_number: 1.0,
    radio_serial: '-',
    serial_number: '-',
    uuid: '-',
    width: 1.0
  },
  log_events: {
    log_severity: '-',
    log_event_code: 0,
    log_message: '-',
    log_interval: 1.0,
    timestamp: 0
  },
  location: {
    direction: 1.0,
    latitude: 1.0,
    longitude: 1.0,
    speed: 1.0
  },
  network: {
    cellular_ip_external: '-',
    cellular_ip_internal: '-',
    dns1: '-',
    dns2: '-',
    ip_reassemblies: 0,
    ip_total_bytes_in: 0,
    ip_total_bytes_out: 0,
    ip_total_packets_in: 0,
    ip_total_packets_out: 0,
    rtt: 0,
    tcp_bytes_in: 0,
    tcp_bytes_out: 0,
    tcp_retransmits: 0,
    transport_protocol: '-',
    udp_bytes_in: 0,
    udp_bytes_out: 0,
    wifi_dhcp: '-',
    wifi_extip: '-',
    wifi_gw: '-',
    wifi_ip: '-',
    wifi_mask: '-'
  },
  requests: [ {
    conn_id: 0,
    cont_encoding: '-',
    cont_type: '-',
    end_ts: 0,
    first_byte_ts: 0,
    keepalive_status: 0,
    local_cache_status: '-',
    method: '-',
    network: '-',
    protocol: '-',
    received_bytes: 0,
    sent_bytes: 0,
    start_ts: 0,
    status_code: 0,
    success_status: 0,
    transport_protocol: '-',
    url: 'request'
  } ],
  wifi: {
    mac: '-',
    ssid: '-',
    wifi_enc: '-',
    wifi_freq: '-',
    wifi_rssi: '-',
    wifi_rssibest: '-',
    wifi_sig: '-',
    wifi_speed: '-'
  }
};

var ip_ = '8.8.8.8';
var geo_ = { country_code2: 'US',
  region_name: 'CA',
  city_name: 'Mountain View'
};

var key_ = {};
var now_ = Date.now();


//  ---------------------------------
var fire1_ = function() {

  return request({
      url: ( config.testing.server + '/v' + config.api.version + '/' + config.api.main_endpoint + '/apps' ),
      method: 'POST',
      json: true,
      body: one_record_,
      tunnel: false,
      strictSSL: false, // self signed certs used
      headers: {
        'User-Agent': 'nodejs',
        'x-forwarded-for': ip_
      },
      followRedirect: false,
      timeout: 15000
    });
};

//  ---------------------------------
var fire_ = function( num ) {

  var dummy = [];
  dummy.length = num/*stupid hack*/;
  return promise.map( dummy, function() {
    return fire1_();
  }, { concurrency: 50 } );
};





//  ----------------------------------------------------------------------------------------------//


//  here we go
describe('Rev SDK stats API, overall testing', function() {

  this.timeout( 30000 );
  var N1 = 100;
  var N2 = 570;

  //  ---------------------------------
  before( function( done ) {

    console.log( '    ### accessibility check' );
    check_access_()
      .catch( function( err ) {
        console.log( '     connection error with Stats API service. It should be running and configured properly' );
        console.log( '     ' + err.toString() );
        done( err );
      })
      .then( function() {
        console.log( '    ### app creation' );
        return create_app_( one_record_.app_name );
      })
      .then( function( data ) {
        console.log( '    ### app_id ' + data.id );
        console.log( '    ### app_name ' + one_record_.app_name );
        console.log( '    ### sdk_key ' + data.sdk_key );
        key_.id = data.id;
        key_.sdk_key = data.sdk_key;
        one_record_.sdk_key = data.sdk_key;
        console.log( '    ### force keys reload' );
        return force_keys_reload_();
      })
      .then( function() {
        console.log( '        "before" hook done' );
        done();
      })
      .catch( function( err ) {
        console.log( '     ' + err.toString() );
        done( err );
      });
  });

  //  ---------------------------------
  after( function( done ) {

    console.log( '    ### clearing' );
    delete_app_( key_.id )
      .then( function() {
        console.log( '    ### app removed' );
        console.log( '        "after" hook done' );
        done();
      })
      .catch( function( err ) {
        console.log( '     ' + err.toString() );
        done( err );
      });
  });

  //  ---------------------------------
  it('incoming messages with the new SDK key should be properly processed', function( done ) {

    console.log( '    ### ' + N1 + ' messages' );
    fire_( N1 )
      .then( function() {
        console.log( '    ### processed, force fire queue' );
        return force_fire_queue_();
      })
      .then( function() {
        console.log( '    ### done' );
        done();
      })
      .catch( function( err ) {
        done( err );
      });

  });

  //  ---------------------------------
  it('yet another incoming messages with the new SDK key should be properly processed', function( done ) {

    console.log( '    ### ' + N2 + ' messages' );
    fire_( N2 )
      .then( function() {
        console.log( '    ### processed, force fire queue' );
        return force_fire_queue_();
      })
      .then( function() {
        console.log( '    ### done' );
        done();
      })
      .catch( function( err ) {
        done( err );
      });

  });

  //  ---------------------------------
  it('API should show correct amount of messages stored in the ES', function( done ) {

    get_sdk_count_()
      .then( function( data ) {
        console.log( '    ### gotcha, ' + data.data.hits + ' messages' );
        data.data.hits.should.be.equal( N1 + N2 );
        done();
      })
      .catch( function( err ) {
        done( err );
      });

  });

  //  ---------------------------------
  it.skip('stored messages should contain correct added data (geoip and account_id)', function( done ) {

    promise.all( [
      load1_( false/*es*/ ),
      load1_( true/*esurl*/ )
    ] )
    .then( function( data ) {
      data[0].geoip.region_name.should.be.equal( geo_.region_name );
      data[0].geoip.city_name.should.be.equal( geo_.city_name );
      data[1].geoip.country_code2.should.be.equal( geo_.country_code2 );
      data[1].geoip.region_name.should.be.equal( geo_.region_name );
      data[1].geoip.city_name.should.be.equal( geo_.city_name );
      data[0].account_id.should.be.equal( key_.account_id );
      data[1].account_id.should.be.equal( key_.account_id );
      done();
    })
    .catch( function( err ) {
      done( err );
    });

  });

});

