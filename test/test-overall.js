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
var url = require('url');
var config = require('config');
var promise = require('bluebird');
var request = promise.promisify(require('request'));
var fs = promise.promisifyAll(require('fs'));
var elastic = require('elasticsearch');

var dispatcher = require('../lib/dispatcher.js');
// var keys = require('../lib/keys.js');


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
    });
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
var get_sdk_count_ = function() {
  return request({
    url: config.testing.api.server + '/v1/stats/sdk/app/' + test_.app_id +
      '?from_timestamp=-1h&to_timestamp=' + (Date.now() + 1800000),
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
};

//  ---------------------------------
var load_msg_files_ = function() {
  return fs.readFileAsync( './test/message.50.json', 'utf8' )
    .then( JSON.parse )
    .then( function( data ) {
      one_message_ = data;
      return fs.readFileAsync( './test/message.50.ill-formed.json', 'utf8' );
    })
    .then( JSON.parse )
    .then( function( data ) {
      ill_formed_message_ = data;

      test_.start_ts = Date.now();
      test_.end_ts = 0;
      test_.hits = one_message_.requests.length;
      for ( var i = 0; i < test_.hits; ++i ) {
        var rec = one_message_.requests[i];
        if ( rec.start_ts !== 0 && rec.start_ts < test_.start_ts ) {
          test_.start_ts = rec.start_ts;
        }
        if ( rec.end_ts !== 0 && rec.end_ts > test_.end_ts ) {
          test_.end_ts = rec.end_ts;
        }
      }
      idx_ = dispatcher.indexName(test_.start_ts);
    });
};

//  ---------------------------------
var ip_ = '8.8.8.8';
var geo_ = {
  country_code2: 'US',
  region_name: 'CA',
  city_name: 'Mountain View'
};
var test_ = {
  account_id: config.testing.api.account_id
};
var idx_,
  one_message_,
  ill_formed_message_,
  client_,
  client_url_;


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
    });
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
      body: { query: { filtered: { filter: { term: { app_id: test_.app_id } } } }, size: 1 }
    })
    .then(function(data) {
      if (data.hits.total === 0) {
        throw new Error('Records not found for the application ID ' + test_.app_id);
      }
      var item = data.hits.hits[0]._source;
      return {
        ip: item.ip,
        geoip: item.geoip,
        sdk_key: item.sdk_key,
        app_id: item.app_id,
        account_id: item.account_id,
        hits: item.hits,
        start_ts: item.start_ts,
        end_ts: item.end_ts,
        rec: item.requests[0]
      };
    });
};

//  ---------------------------------
var refresh_ = function() {
  return promise.all([
      client_.indices.refresh({ index: idx_ }),
      client_url_.indices.refresh({ index: idx_ })
    ]);
};


//  ----------------------------------------------------------------------------------------------//


//  here we go
describe('Rev SDK stats API, overall testing', function() {

  this.timeout(300000);
  var suite_init = false;

  //  ---------------------------------
  before(function(done) {

    console.log('    ### accessibility check');
    check_access_()
      .then(function() {
        console.log('    ### load messages from json files');
        return load_msg_files_();
      })
      .then(function() {
        console.log('    ### index name [' + idx_ + ']');
        console.log('    ### app creation');
        return create_app_();
      })
      .then(function(data) {
        console.log('    ### app_id ' + data.id);
        console.log('    ### sdk_key ' + data.sdk_key);
        test_.app_id = data.id;
        test_.sdk_key = data.sdk_key;
        one_message_.sdk_key = data.sdk_key;
        ill_formed_message_.sdk_key = data.sdk_key;
        console.log('    ### init ES interface');
        //  "Do not reuse objects to configure the elasticsearch" ... sigh
        var es = {
          host: config.service.elastic_es.host,
          requestTimeout: 120000,
          log: [{
            'type': 'stdio',
            'levels': ['error', 'warning']
          }]
        };
        client_ = new elastic.Client(es);
        var esurl = {
          host: config.service.elastic_esurl.host,
          requestTimeout: 120000,
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
        console.log('        "before" hook done\n');
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

    console.log('\n    ### clearing');
    delete_app_(test_.app_id)
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
    console.log('    ### ' + N + ' messages are being processed');
    fire_(N, one_message_)
      .then(function() {
        console.log('    ### done, wait for the queue to be fired, ' + config.service.queue_clear_timeout + 'ms');
      })
      .delay(config.service.queue_clear_timeout + 1000)
      .then(function() {
        console.log('    ### refresh ES indices');
        return refresh_();
      })
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
    console.log('    ### ' + N + ' messages are being processed');
    fire_(N, one_message_)
      .then(function() {
        console.log('    ### done, wait for the queue to be fired, 3x' +
          config.service.queue_clear_timeout + 'ms');
      })
      .delay(config.service.queue_clear_timeout * 3)
      .then(function() {
        console.log('    ### refresh ES indices');
        return refresh_();
      })
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
        console.log('    ### gotcha, ' + data.data.hits + ' messages stored');
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

        data[0].account_id.should.be.equal(test_.account_id);
        data[1].account_id.should.be.equal(test_.account_id);

        data[0].app_id.should.be.equal(test_.app_id);
        data[1].app_id.should.be.equal(test_.app_id);

        data[0].ip.should.be.equal(ip_);
        data[1].ip.should.be.equal(ip_);

        data[0].hits.should.be.equal(test_.hits);
        data[1].hits.should.be.equal(test_.hits);
        data[0].start_ts.should.be.equal(test_.start_ts);
        data[1].start_ts.should.be.equal(test_.start_ts);
        data[0].end_ts.should.be.equal(test_.end_ts);
        data[1].end_ts.should.be.equal(test_.end_ts);

        data[1].rec.domain.should.be.equal( url.parse( ( data[1].rec.url || '' ) ).hostname || '' );

        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  //  ---------------------------------
  it('should refuse to process ill-formed messages', function(done) {

    fire1_(ill_formed_message_)
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
    delete_app_(test_.app_id)
      .then(function() {
        console.log('    ### app removed');
        console.log('    ### wait for the app keys to be reloaded, ' + config.service.key_id.poll_interval + 'ms');
      })
      .delay(config.service.key_id.poll_interval + 500)
      .then(function() {
        console.log('    ### the new sdk_key is no more valid, trying to fire record again');
        return fire1_(one_message_);
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

