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
var elastic = require('elasticsearch');
var dispatcher = require('../lib/dispatcher.js');


//  ----------------------------------------------------------------------------------------------//

var one_record_ = {
  version: '1.0',
  app_name: ( 'dispatcher-test-app-00' + Math.floor( Math.random() * 900 + 100 ) ),
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

var now_ = Date.now();
var idx_ = dispatcher.indexName( now_ );
var client_;
var client_url_;


//  ---------------------------------
var count1_ = function( url ) {
  return ( url ? client_url_ : client_ ).count({
    index: idx_,
    body: {
      query: {
        filtered: {
          filter: {
            term: {
              app_name: one_record_.app_name
            }
          }
        }
      }
    }
  });
};

//  ----------------------------------------------------------------------------------------------//


//  here we go
describe.skip('Rev SDK stats API, overall testing', function() {

  this.timeout( config.service.queue_clear_timeout * 3 );

  before( function( done ) {
    console.log( '    ### data preparation' );

    //  "Do not reuse objects to configure the elasticsearch" ... sigh
    var es = {
        host: config.service.elastic_es.host,
        requestTimeout: 60000,
        log: [{
          'type': 'stdio',
          'levels': [ 'error', 'warning' ]
        }]
      };
    client_ = new elastic.Client( es );
    var esurl = {
        host: config.service.elastic_esurl.host,
        requestTimeout: 60000,
        log: [{
          'type': 'stdio',
          'levels': [ 'error', 'warning' ]
        }]
      };
    client_url_ = new elastic.Client( esurl );

    one_record_.network.cellular_ip_external = '8.8.8.8';
    one_record_.log_events.timestamp = now_;
    console.log( '    ### app_name ' + one_record_.app_name );
    console.log( '    ### queue_clear_timeout set to ' + config.service.queue_clear_timeout + 'ms, done' );
    done();
  });

  //  ---------------------------------
  it('dispatcher should successfully gulp half of message queue', function( done ) {

    var half = Math.floor( config.service.upload_size / 2 );
    for ( var i = 0; i < half; ++i ) {
      dispatcher.handle( one_record_ );
    }

    dispatcher.queueSize().should.be.equal( half );
    dispatcher.beingSent().should.be.equal( 0 );
    done();
  });

  it('dispatcher should send filled up message queue', function( done ) {

    var half = Math.floor( config.service.upload_size / 2 );
    for ( var i = 0; i < config.service.upload_size; ++i ) {
      dispatcher.handle( one_record_ );
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

  it('saved records amount should be equal ' + Math.floor( config.service.upload_size * 1.5 ), function( done ) {

    promise.all( [
      count1_( false/*es*/ ),
      count1_( true/*esurl*/ )
    ] )
    .then( function( data ) {
      // console.log( data );
      var target = Math.floor( config.service.upload_size * 1.5 );
      data[0].count.should.be.equal( target );
      data[1].count.should.be.equal( target );
      done();
    })
    .catch( function( err ) {
      done( err );
    });

  });

});

