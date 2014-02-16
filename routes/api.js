var User = require('../models/User'),
	Utils = require('../tools/utils'),
	Item = require('../models/Item');

module.exports = function (app) {
    require('../routes/user')(app);
    require('../routes/plan')(app);
    require('../routes/item')(app);

    // Signin
    app.post('/auth/signin', function (req, res) {
    	var email = req.body.email,
    		pw = req.body.pass,
    		rememberMe = req.body.rememberMe;

    	if (!email || !pw) return res.send(400);

    	User.findOne({ mail: email }, function (err, user) {
			if (err) return res.send(500);
			if (!user) return res.send({success: false, error: 'Auth failed.' });

			user.comparePw(pw, function (err, match) {
				if (err) return res.send(500);
				if (!match) return res.send({success: false, error: 'Auth failed.' });

				var t = Utils.generateToken(user, rememberMe);
				res.send(200, {
					success: true,
					profile: {
						id: user._id,
						email: user.mail,
						plan: user.currentPlan,
						token: t
					}
				});
			});
		});
    });

    // Register
    app.post('/auth/signup', function (req, res) {
		var email = req.body.email,
			pw = req.body.pass;

		if (!email || !pw) return res.send(400);

		User.findOne({ mail: email }, function (err, user) {
			if (err) return res.send(500);
			if (user) return res.send({success: false, error: 'Email taken.'});
			
			new User({ mail: email, password: pw })
				.save( function (err) {
					if (err) return res.send(500);
					
					res.send(201, {
						success: true
					});
				});
		});
    });

};
