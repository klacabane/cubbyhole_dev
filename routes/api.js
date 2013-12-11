/*
 * Serves JSON to the AngularJS client
 */
var User = require('../models/User');

/*
 * GET
 */
// Get all the users
exports.users = function (req, res) {
    User
        .find()
        .exec(function (error, users) {
            if (error) {
                console.log(users);
            } else {
                res.json({
                    users: users
                });
            }
        });
};


/*
 * POST
 */


/*
 * PUT
 */


/*
 * DELETE
 */