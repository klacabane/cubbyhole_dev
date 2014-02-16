var config = {
	db: {
		address: "mongodb://localhost/Cubbyhole",
		username: "",
		password: ""
	},
	token: {
		secret: "secret",
		expiration: 1,
		expiration_long: 365
	},
	storage: {
		dir: './storage'
	}
};

module.exports = config;

