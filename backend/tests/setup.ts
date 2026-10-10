// Shared Jest setup for RailNexus backend tests.
// Integration tests that need real infrastructure (Oracle/Redis/Mongo) gate
// themselves on environment flags so unit tests stay runnable offline.

import 'dotenv/config'

export {}