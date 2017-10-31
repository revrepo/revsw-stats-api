/*************************************************************************
*
* REV SOFTWARE CONFIDENTIAL
*
* [2013] - [2017] Rev Software, Inc.
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
var config = require('config');
var promise = require('bluebird');
var request = promise.promisify(require('request'));
var revAdmin = config.get('user');
var api = {

    /**
    * Get a token from the API
    * @param {Object} user ;user to authenticate, if none is provided will user user from config
    * @returns {Promise}
    */
    authenticateUser: function (user) {

        return request({
            url: config.testing.api.server + '/v1/authenticate',
            method: 'POST',
            formData: {
                email: user === undefined ? revAdmin.email : user.email,
                password: user === undefined ? revAdmin.password : user.password
            }
        })
            .then(function (res) {
                return JSON.parse(res.body).token;
            });
    }
};

module.exports = api;