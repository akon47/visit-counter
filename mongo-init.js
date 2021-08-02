db.createUser(
    {
        user: "counter",
        pwd: "counter",
        roles: [
            {
                role: "readWrite",
                db: "visit-counter"
            }
        ]
    }
);

db.createCollection("visit-counter");