var Notification = require('../models/Notification'),
    mw = require('../tools/middlewares');

module.exports = function (app) {
    app.get('/notification', mw.checkAuth, function (req, res) {
        var userId = req.user;
        Notification.find({user: userId})
            .populate('share')
            .exec(function (err, notes) {
            if (err) return res.send(500);

            res.send(201, {
               data: notes
            });
        });
    });
};
