process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
var should = require('should-http');
var request = require('supertest');
var agent = require('supertest-as-promised');

var express = require('express');
var fs = require('fs');
var https = require('https');
var sleep = require('sleep');
var utils = require('../lib/utilities.js');
var config = require('config');
var speakeasy = require('speakeasy');

var testAPIUrl = ( process.env.API_QA_URL ) ? process.env.API_QA_URL : 'https://localhost:' + config.get('service.https_port');
var testAPIUrlHTTP = ( process.env.API_QA_URL_HTTP ) ? process.env.API_QA_URL_HTTP : 'http://localhost:' + config.get('service.http_port');
var testAPIUrlExpected = ( process.env.API_QA_URL ) ? process.env.API_QA_URL : 'https://localhost:' + config.get('service.http_port');

var qaUserWithUserPerm = 'qa_user_with_user_perm@revsw.com',
  qaUserWithAdminPerm = 'api_qa_user_with_admin_perm@revsw.com',
  qaUserWithAdminPermPassword = 'password1',
  qaUserWithRevAdminPerm = 'qa_user_with_rev-admin_perm@revsw.com',
  qaUserWithResellerPerm = 'api_qa_user_with_reseller_perm@revsw.com',
  qaUserWithResellerPermPassword = 'password1',
  wrongUsername = 'wrong_username@revsw.com',
  wrongPassword = 'we5rsdfsdfs',
  testDomain = 'qa-api-test-domain.revsw.net',  // this domain should exist in the QA environment
  secretKey = '';

    var updatedConfigJson = {

    'rev_component_co': {
    'enable_rum': false,
    'enable_optimization': false,
    'mode': 'moderate',
    'img_choice': 'medium',
    'js_choice': 'medium',
    'css_choice': 'medium'
    },
    'rev_component_bp': {
    'enable_cache': true,
    'block_crawlers': true,
    'cdn_overlay_urls': [],
    'caching_rules': [
      {
      'cookies': {
        'remove_ignored_from_response': false,
        'remove_ignored_from_request': false,
        'keep_or_ignore_list': [],
        'list_is_keep': false,
        'ignore_all': false,
        'override': false
      },
      'browser_caching': {
        'force_revalidate': false,
        'new_ttl': 0,
        'override_edge': false
      },
      'edge_caching': {
        'override_no_cc': true,
        'new_ttl': 1,
        'override_origin': true
      },
      'url': {
        'value': '/image/**',
        'is_wildcard': true
      },
      'version': 1
      }
    ],
    'enable_security': true,
    'web_app_firewall': 'off',
    'acl': {
      'enabled': false,
      'action': 'deny_except',
      'acl_rules': [
      {
        'header_value': '',
        'header_name': '',
        'country_code': 'CH',
        'subnet_mask': '',
        'host_name': ''
      }
      ]
    },
    'cache_bypass_locations': []
    }

    };


describe('Rev API', function() {

  this.timeout(10000);

  var adminToken = '',
    userToken = '',
    userCompanyId = '',
    testDomainId,
    testDomain = 'qa-api-test-domain.revsw.net',
    domainConfigJson = {};


  it('should return OK on healthcheck call', function(done) {
    request(testAPIUrl)
      .get('/healthcheck')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Everything is OK');
        response_json.version.should.be.a.String();
        done();
      });
  });

  it('should return CORS headers', function(done) {
    request(testAPIUrl)
      .get('/healthcheck')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .expect('access-control-allow-origin', '*')
      .expect('access-control-allow-methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
      .expect('access-control-allow-headers', 'Authorization, Content-Type, If-None-Match')
      .expect('access-control-expose-headers', 'WWW-Authenticate, Server-Authorization')
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Everything is OK');
        done();
      });
  });


  it('should get a list of users using Master password', function(done) {
    request(testAPIUrl)
      .get('/v1/users')
      .auth(qaUserWithAdminPerm, 'rjU7rO9Y5kbvdM408Mz8')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.length.should.be.above(0);
        done();
      });
  });


  it('should receive a list of first mile locations', function(done) {
    request(testAPIUrl)
      .get('/v1/locations/firstmile')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.length.should.be.above(0);
        for (var i=0; i < response_json.length; i++) {
          response_json[i].locationName.should.be.a.String();
          response_json[i].id.should.be.a.String();
        }
        done();
      });
  });


  it('should receive 404 on wrong API path', function(done) {
    request(testAPIUrl)
      .get('/v1/users-wrong-path')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(404)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(404);
        response_json.error.should.be.equal('Not Found');
        done();
      });
  });


  it('should not authenticate user with wrong username', function(done) {
    request(testAPIUrl)
      .get('/v1/users')
      .auth(wrongUsername, wrongPassword)
      .expect(401)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.statusCode.should.be.equal(401);
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(401);
        response_json.error.should.be.equal('Unauthorized');
        response_json.message.should.be.equal('Bad username or password');
        done();
      });
  });


  it('should not authenticate user with wrong password', function(done) {
    request(testAPIUrl)
      .get('/v1/users')
      .auth(qaUserWithAdminPerm, wrongPassword)
      .expect(401)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.statusCode.should.be.equal(401);
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(401);
        response_json.error.should.be.equal('Unauthorized');
        response_json.message.should.be.equal('Bad username or password');
        done();
      });
  });

  it('should allow user with RevAdmin role to get a list of users', function(done) {
    request(testAPIUrl)
      .get('/v1/users')
      .auth(qaUserWithRevAdminPerm, 'password1')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.length.should.be.above(1);
        done();
      });
  });

  // Testing domain-related calls

  xit('should get a domains list as user with Admin permissions', function(done) {
    request(testAPIUrl)
      .get('/v1/domains')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }

        var response_json = JSON.parse(res.text);

        response_json.length.should.be.above(0);
        for (var i=0; i < response_json.length; i++ ) {
          response_json[i].companyId.should.be.a.String();
          response_json[i].name.should.be.a.String();
          response_json[i].id.should.be.a.String();
          response_json[i].sync_status.should.be.a.String();
          if ( response_json[i].name === testDomain ) {
            testDomainId = response_json[i].id;
          }
        }
        testDomainId.should.be.a.String();
        done();
      });
  });


  xit('should get domain configuration for test domain', function(done) {
    request(testAPIUrl)
      .get('/v1/domains/' + testDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }

        var response_json = JSON.parse(res.text);
        response_json.id.should.be.equal(testDomainId);
        response_json.name.should.be.equal(testDomain);
        done();
      });
  });

});


describe('Rev API Admin User', function() {

  this.timeout(10000);

  var numberOfUsers = 0,
    userId = '',
    myCompanyId = [],
    myDomains = [],
    testUser = 'api-qa-user-' + Date.now() + '@revsw.com',
    testUserId,
    testPassword = 'password1',
    newTestPassword = 'password2',
    newDomainName = 'delete-me-API-QA-name-' + Date.now() + '.revsw.net',
    newDomainId,
    createDomainIds,
    testUserProfile = {};

  var newUserJson = {
    'firstname': 'API QA User',
    'lastname': 'With Admin Perm',
    'email': 'deleteme111@revsw.com',
    'companyId': [
      '55b6ff6a7957012304a49d04'
    ],
    'domain': [
      'qa-api-test-domain.revsw.net'
    ],
    'theme': 'light',
    'role': 'admin',
    'password': 'password1',
    'two_factor_auth_enabled' : false,
    'access_control_list': {
      'readOnly': false,
      'test': true,
      'configure': true,
      'reports': true,
      'dashBoard': true
    }
  };

  var updatedUserJson = {
    'firstname': 'Updated API QA User',
    'lastname': 'Updated With Admin Perm',
    'companyId': [
      '55b6ff6a7957012304a49d04'
    ],
    'domain': [
      'qa-api-test-domain.revsw.net'
    ],
    'theme': 'dark',
    'role': 'user',
    'password': newTestPassword,
    'two_factor_auth_enabled' : false,
    'access_control_list': {
      'readOnly': true,
      'test': false,
      'configure': false,
      'reports': false,
      'dashBoard': false
    }
  };

  it('should be denied access to /v1/accounts functions', function(done) {
    request(testAPIUrl)
      .get('/v1/accounts')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(403)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.statusCode.should.be.equal(403);
        var response_json = JSON.parse(res.text);
        response_json.error.should.be.equal('Forbidden');
        response_json.message.should.startWith('Insufficient scope');
        done();
      });
  });

  it('should get a list of users', function(done) {
    request(testAPIUrl)
      .get('/v1/users')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        // response_json.statusCode.should.be.equal(200);
        response_json.length.should.be.above(0);
        numberOfUsers = response_json.length;


        // now let's find the ID of the API test user (variable qaUserWithAdminPerm)
        var foundMyself = false;
        for ( var i=0; i < numberOfUsers; i++ ) {
          response_json[i].companyId.should.be.an.instanceOf(Array);
          response_json[i].domain.should.be.an.instanceOf(Array);
          response_json[i].email.should.be.type('string');
          response_json[i].firstname.should.be.type('string');
          response_json[i].user_id.should.be.type('string');
          if ( response_json[i].email === qaUserWithAdminPerm ) {
            foundMyself = true;
            userId = response_json[i].user_id;
            myCompanyId = response_json[i].companyId;
            myDomains = response_json[i].domain;
          }
        }
        foundMyself.should.be.equal(true);

        // check that the returned users all belong to the same companyId as the test user
        for ( i=0; i < numberOfUsers; i++ ) {
          var companyIdOverlap = utils.areOverlappingArrays(myCompanyId, response_json[i].companyId);
          companyIdOverlap.should.be.equal(true);
        }

        done();
      });
  });

  it('should get the details of test user account ' + qaUserWithAdminPerm, function(done) {
    request(testAPIUrl)
      .get('/v1/users/' + userId )
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.role.should.be.equal('admin');
        response_json.email.should.be.equal(qaUserWithAdminPerm);
        response_json.user_id.should.be.equal(userId);
        createDomainIds = response_json.domain;
        done();
      });
  });

  it('should fail to receive user details for RevAdmin user dev@revsw.com, ID 55888147fef4198e079c315e', function(done) {
    request(testAPIUrl)
      .get('/v1/users/55888147fef4198e079c315e' )
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.error.should.be.equal('Bad Request');
        response_json.message.should.be.equal('User not found');
        done();
      });
  });

  it('should fail to create a new user account using empty Json', function(done) {
    request(testAPIUrl)
      .post('/v1/users')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send( {} )
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.error.should.be.equal('Bad Request');
        response_json.message.should.be.equal('child "email" fails because ["email" is required]');
        done();
      });
  });

  it('should create a new user account ' + testUser, function(done) {
    newUserJson.email = testUser;
    newUserJson.companyId = myCompanyId;
    newUserJson.domain = myDomains;
    request(testAPIUrl)
      .post('/v1/users')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(newUserJson)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully created new user');
        response_json.object_id.should.be.a.String();
        testUserId = response_json.object_id;
        done();
      });
  });

  it('should find a new record about adding a new user in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(testUserId);
        last_obj.activity_type.should.be.equal('add');
        last_obj.activity_target.should.be.equal('user');
        done();
      });
  });

  it('should fail to delete the new user account using the same account for API access', function(done) {
    request(testAPIUrl)
      .delete('/v1/users/' + testUserId)
      .auth(testUser, 'password1')
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        done();
      });
  });


  it('should read back the configuration of freshly created user ' + testUser, function(done) {
    request(testAPIUrl)
      .get('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.user_id.should.be.equal(testUserId);
        response_json.updated_at.should.be.a.String();
        response_json.created_at.should.be.a.String();

        var verifyUserJson = response_json;
        delete verifyUserJson.created_at;
        delete verifyUserJson.updated_at;
        delete verifyUserJson.user_id;
        delete newUserJson.password;
        verifyUserJson.should.be.eql(newUserJson);
        done();
      });
  });


  it('should get a list of domains using freshly created user ' + testUser, function(done) {
    request(testAPIUrl)
      .get('/v1/domain_configs')
      .auth(testUser, testPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.length.should.be.above(0);
        done();
      });
  });

  it('should change the password for new user account ' + testUser, function(done) {
    request(testAPIUrl)
      .put('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send( { password: newTestPassword } )
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully updated the user');
        done();
      });
  });

  it('should find a new record about updating user in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(testUserId);
        last_obj.activity_type.should.be.equal('modify');
        last_obj.activity_target.should.be.equal('user');
        done();
      });
  });

  it('should get a list of domains using freshly created user ' + testUser +' and new password', function(done) {
    request(testAPIUrl)
      .get('/v1/domain_configs')
      .auth(testUser, newTestPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.length.should.be.above(0);
        done();
      });
  });

  it('should delete test user account ' + testUser, function(done) {
    request(testAPIUrl)
      .delete('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully deleted the user');
        done();
      });
  });

  it('should find a new record about deleting user in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(testUserId);
        last_obj.activity_type.should.be.equal('delete');
        last_obj.activity_target.should.be.equal('user');
        done();
      });
  });

  it('should create new user account ' + testUser + ' without specifying companyId and domain', function(done) {
    newUserJson.email = testUser;
    delete newUserJson.companyId;
    delete newUserJson.domain;
    newUserJson.password = testPassword;
    request(testAPIUrl)
      .post('/v1/users')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(newUserJson)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully created new user');
        response_json.object_id.should.be.a.String();
        testUserId = response_json.object_id;
        done();
      });
  });

  it('should find a new record about adding a new user in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(testUserId);
        last_obj.activity_type.should.be.equal('add');
        last_obj.activity_target.should.be.equal('user');
        done();
      });
  });

  xit('should read back the configuration of freshly created user ' + testUser + ' and verify companyId and domain attributes', function(done) {

  var newUserJson = {
  'firstname': 'API QA User',
  'lastname': 'With Admin Perm',
  'email': 'deleteme111@revsw.com',
  'two_factor_auth_enabled' : false,
  'theme': 'light',
  'role': 'admin',
  'password': 'password1',
  'access_control_list': {
    'readOnly': false,
    'test': true,
    'configure': true,
    'reports': true,
    'dashBoard': true
  }
  };

    newUserJson.email = testUser;

    request(testAPIUrl)
      .get('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.user_id.should.be.equal(testUserId);
        response_json.updated_at.should.be.a.String();
        response_json.created_at.should.be.a.String();

        var verifyUserJson = response_json;
        delete verifyUserJson.created_at;
        delete verifyUserJson.updated_at;
        delete verifyUserJson.user_id;
        delete newUserJson.password;
        for (var attrname in newUserJson) {
          response_json[attrname].should.be.equal(newUserJson[attrname]);
        }
        done();
      });
  });

  it('should fail to set new companyId 55ba46a67957012304a49d0f which does not belong to test user ' + testUser, function(done) {

    request(testAPIUrl)
      .put('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send( { companyId: [ '55b6ff6a7957012304a49d04', '55ba46a67957012304a49d0f' ] })
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.error.should.be.equal('Bad Request');
        response_json.message.should.be.equal('The new companyId is not found');
        done();
      });
  });

  it('should update test user ' + testUser + ' with new details in all fields', function(done) {

    request(testAPIUrl)
      .put('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(updatedUserJson)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully updated the user');
        done();
      });
  });

  it('should find a new record about updating user in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(testUserId);
        last_obj.activity_type.should.be.equal('modify');
        last_obj.activity_target.should.be.equal('user');
        done();
      });
  });

  it('should read back the updated configuration of test user ' + testUser, function(done) {
    request(testAPIUrl)
      .get('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.user_id.should.be.equal(testUserId);
        response_json.updated_at.should.be.a.String();
        response_json.created_at.should.be.a.String();

        var verifyUserJson = response_json;
        delete verifyUserJson.created_at;
        delete verifyUserJson.updated_at;
        delete verifyUserJson.user_id;
        delete verifyUserJson.email;
        delete updatedUserJson.password;
        verifyUserJson.should.be.eql(updatedUserJson);
        done();
      });
  });

  it('should get a list of domains using updated user ' + testUser +' and new password', function(done) {
    request(testAPIUrl)
      .get('/v1/domain_configs')
      .auth(testUser, newTestPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
      //  response_json.length.should.be.above(0);
        done();
      });
  });



  it('should delete test user account ' + testUser, function(done) {
    request(testAPIUrl)
      .delete('/v1/users/' + testUserId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully deleted the user');
        done();
      });
  });

  it('should find a new record about updating user in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(testUserId);
        last_obj.activity_type.should.be.equal('delete');
        last_obj.activity_target.should.be.equal('user');
        done();
      });
  });


  xit('should fail to create a new domain with existing domain name ' + newDomainName, function(done) {
    this.timeout(120000);
    var newDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      name: testDomain,
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .post('/v1/domains')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(newDomainJson)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.message.should.be.equal('The domain name is already registered in the system');
        done();
      });
  });


  xit('should fail to create a new domain with unexisting CO group name', function(done) {
    this.timeout(60000);
    var newDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      name: newDomainName,
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab which does not exist',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .post('/v1/domains')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(newDomainJson)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.message.should.be.equal('Specified Rev first mile location cannot be found');
        done();
      });
  });

  xit('should fail to create a new domain with companyId 55ba46a67957012304a49d0f which does not belong to the user', function(done) {
    this.timeout(60000);
    var newDomainJson = {
      companyId: '55ba46a67957012304a49d0f',
      name: newDomainName,
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .post('/v1/domains')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(newDomainJson)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.message.should.be.equal('Your user does not manage the specified company ID');
        done();
      });
  });

  xit('should fail to create a new domain with empty Json', function(done) {
    this.timeout(60000);
    request(testAPIUrl)
      .post('/v1/domains')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send( {} )
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.message.should.be.equal('child "name" fails because ["name" is required]');
        done();
      });
  });


  xit('should create a new domain configuration for name ' + newDomainName, function(done) {
    this.timeout(120000);
    var newDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      name: newDomainName,
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .post('/v1/domains')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(newDomainJson)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully created the domain');
        response_json.object_id.should.be.a.String();
        newDomainId = response_json.object_id;
        done();
      });
  });

  xit('should find a new record about the addition of new domain in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(newDomainId);
        last_obj.activity_type.should.be.equal('add');
        last_obj.activity_target.should.be.equal('domain');
        done();
      });
  });

  xit('should read the basic confguration of freshly created domain ' + newDomainName, function(done) {
    this.timeout(60000);
    newDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      id: newDomainId,
      name: newDomainName,
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .get('/v1/domains/' + newDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.sync_status.should.be.equal('Success');
        delete response_json.sync_status;
        response_json.updated_at.should.be.a.String();
        delete response_json.updated_at;
        response_json.created_at.should.be.a.String();
        delete response_json.created_at;
        response_json.cname.should.be.equal(newDomainName + '.revdn.net');
        delete response_json.cname;
        response_json.should.be.eql(newDomainJson);
        done();
      });
  });

  xit('should fail to update the new domain with unexisting CO group name', function(done) {
    this.timeout(60000);
    updateDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab which does not exist',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .put('/v1/domains/' + newDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(updateDomainJson)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.message.should.be.equal('Specified Rev first mile location cannot be found');
        done();
      });
  });

  xit('should fail to update the new domain with companyId 55ba46a67957012304a49d0f belonging to another user', function(done) {
    this.timeout(60000);
    updateDomainJson = {
      companyId: '55ba46a67957012304a49d0f',
      origin_server: 'origin_server.com',
      tolerance: '3000',
      origin_server_location: 'HQ Test Lab',
      origin_host_header: 'origin_host_header.com'
    };

    request(testAPIUrl)
      .put('/v1/domains/' + newDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(updateDomainJson)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.message.should.be.equal('Your user does not manage the specified company ID');
        done();
      });
  });

  xit('should update all fields for test domain ' + newDomainName, function(done) {
    this.timeout(120000);
    updateDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      origin_server: 'origin_server2.com',
      tolerance: '4000',
      origin_server_location: 'HQ Office Test Lab',
      origin_host_header: 'origin_host_header2.com'
    };

    request(testAPIUrl)
      .put('/v1/domains/' + newDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(updateDomainJson)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully updated the domain');
        done();
      });
  });

  xit('should find a new record about updating domain in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(newDomainId);
        last_obj.activity_type.should.be.equal('modify');
        last_obj.activity_target.should.be.equal('domain');
        done();
      });
  });

  xit('should read the updated configuration back and check all fields', function(done) {
    this.timeout(60000);
    newDomainJson = {
      companyId: '55b6ff6a7957012304a49d04',
      id: newDomainId,
      name: newDomainName,
      origin_server: 'origin_server2.com',
      tolerance: '4000',
      origin_server_location: 'HQ Office Test Lab',
      origin_host_header: 'origin_host_header2.com'
    };

    request(testAPIUrl)
      .get('/v1/domains/' + newDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.sync_status.should.be.equal('Success');
        delete response_json.sync_status;
        response_json.updated_at.should.be.a.String();
        delete response_json.updated_at;
        response_json.created_at.should.be.a.String();
        delete response_json.created_at;
        response_json.cname.should.be.equal(newDomainName + '.revdn.net');
        delete response_json.cname;
        response_json.should.be.eql(newDomainJson);
        done();
      });
  });



  xit('should read detailed domain configuration', function(done) {
    this.timeout(60000);
    var detailedConfigJson = {

    'rev_component_co': {
    'enable_rum': true,
    'enable_optimization': false,
    'mode': 'moderate',
    'img_choice': 'medium',
    'js_choice': 'medium',
    'css_choice': 'medium'
    },
    'rev_component_bp': {
    'enable_cache': true,
    'block_crawlers': false,
    'cdn_overlay_urls': [],
    'caching_rules': [
      {
      'cookies': {
        'remove_ignored_from_response': false,
        'remove_ignored_from_request': false,
        'keep_or_ignore_list': [],
        'list_is_keep': false,
        'ignore_all': false,
        'override': false
      },
      'browser_caching': {
        'force_revalidate': false,
        'new_ttl': 0,
        'override_edge': false
      },
      'edge_caching': {
        'override_no_cc': false,
        'new_ttl': 0,
        'override_origin': false
      },
      'url': {
        'value': '**',
        'is_wildcard': true
      },
      'version': 1
      }
    ],
    'enable_security': true,
    'web_app_firewall': 'off',
    'acl': {
      'enabled': false,
      'action': 'deny_except',
      'acl_rules': [
      {
        'header_value': '',
        'header_name': '',
        'country_code': '',
        'subnet_mask': '',
        'host_name': ''
      }
      ]
    },
    'cache_bypass_locations': []
    }

    };

    request(testAPIUrl)
      .get('/v1/domains/' + newDomainId + '/details')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.should.be.eql(detailedConfigJson);
        done();
      });
  });

  xit('should fail to update detailed domain configuration with empty Json', function(done) {
    this.timeout(60000);

    request(testAPIUrl)
      .put('/v1/domains/' + newDomainId + '/details')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send( {} )
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(400);
        response_json.error.should.be.equal('Bad Request');
        response_json.message.should.be.equal('child \"rev_component_co\" fails because [\"rev_component_co\" is required]');
        done();
      });
  });

  xit('should update detailed domain configuration', function(done) {
    this.timeout(120000);

    request(testAPIUrl)
      .put('/v1/domains/' + newDomainId + '/details')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .send(updatedConfigJson)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.message.should.be.equal('Successfully updated the domain');
        done();
      });
  });

  xit('should find a new record about updating domain details in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(newDomainId);
        last_obj.activity_type.should.be.equal('modify');
        last_obj.activity_target.should.be.equal('domain');
        done();
      });
  });

  xit('should read back the updated detailed domain configuration and verify all fields', function(done) {
    request(testAPIUrl)
      .get('/v1/domains/' + newDomainId + '/details')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.should.be.eql(updatedConfigJson);
        done();
      });
  });

  xit('should delete test domain ' + newDomainName, function(done) {
    this.timeout(120000);
    request(testAPIUrl)
      .delete('/v1/domains/' + newDomainId)
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        response_json.statusCode.should.be.equal(200);
        response_json.message.should.be.equal('Successfully deleted the domain');
        done();
      });
  });

  xit('should find a new record about deleting domain details in logger', function(done) {
    request(testAPIUrl)
      .get('/v1/activity')
      .auth(qaUserWithAdminPerm, qaUserWithAdminPermPassword)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        var response_json = JSON.parse(res.text);
        var last_obj      = response_json.data[0];
        last_obj.target_id.should.be.equal(newDomainId);
        last_obj.activity_type.should.be.equal('delete');
        last_obj.activity_target.should.be.equal('domain');
        done();
      });
  });

});

