var Notification = require('../models/Notification'),
    mw = require('../tools/middlewares');

module.exports = function (app) {
    app.get('/notification', mw.checkAuth, function (req, res) {
        var userId = req.user;
        Notification.find({user: userId}, function (err, notes) {
            if (err) return res.send(500);
            var results = [];
            notes.forEach(function (note) {
                note.createMessage();
                results.push(note);
            });

            res.send(201, {
                data: results
            });
        });
    });
};
