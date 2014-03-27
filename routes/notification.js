var Notification = require('../models/Notification'),
    mw = require('../tools/middlewares');

module.exports = function (app) {
    /**
     *  GET
     *  Return all authenticated user's notifications
     */
    app.get('/notification', mw.checkAuth, function (req, res) {
        var userId = req.user;
        Notification.find({user: userId}, function (err, notes) {
            if (err) return res.send(500);

            notes.forEach(function (note) {
                note.createMessage();
            });

            res.send(200, {
                data: notes
            });
        });
    });

    /**
     *  DELETE
     */
    app.delete('/notification/:id', mw.checkAuth, mw.validateId, function (req, res) {
        Notification.findOne({_id: req.params.id}, function (err, note) {
            if (err) return res.send(500);
            if (!note) return res.send(404);
            if (req.user !== note.user.toString()) return res.send(403);

            note.remove(function (err) {
                if (err) return res.send(500);
                res.send(200);
            });
        });
    });
};
