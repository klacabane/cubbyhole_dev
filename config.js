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
		dir: "./storage"
	},
    api: {
        address: "http://localhost:3000"
    },
    webclient: {
        address: "http://localhost:8000"
    }
};

module.exports = config;

