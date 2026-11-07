const vm = require('node:vm');

// Validate original payloads before a mock can clone, queue or apply them.
function assertFirestoreData(value, method, document, path = '') {
    if (value === undefined) {
        const error = new Error('Function ' + method + '() called with invalid data. Unsupported field value: undefined'
            + ' (found in field ' + (path || '<root>') + ' in document ' + document + ')');
        error.code = 'invalid-argument';
        throw error;
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) assertFirestoreData(value[i], method, document, path + '[' + i + ']');
    } else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            const field = /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(key) ? key : '\x60' + key + '\x60';
            assertFirestoreData(item, method, document, path ? path + '.' + field : field);
        }
    }
}
function strictFirestore(sdk) {
    function writer(target, name, method) {
        if (typeof target[name] !== 'function') return;
        const original = target[name];
        target[name] = function(ref, data, ...rest) {
            assertFirestoreData(data, method, ref);
            return original.call(this, ref, data, ...rest);
        };
    }
    writer(sdk, 'setDoc', 'setDoc');
    writer(sdk, 'updateDoc', 'updateDoc');
    if (sdk.writeBatch) {
        const original = sdk.writeBatch;
        sdk.writeBatch = function(...args) {
            const batch = original.apply(this, args);
            writer(batch, 'set', 'WriteBatch.set');
            writer(batch, 'update', 'WriteBatch.update');
            return batch;
        };
    }
    if (sdk.runTransaction) {
        const original = sdk.runTransaction;
        sdk.runTransaction = function(db, callback, ...rest) {
            return original.call(this, db, transaction => {
                // Retries may reuse the mock transaction; wrap a fresh facade each time.
                const tx = { ...transaction };
                writer(tx, 'set', 'Transaction.set');
                writer(tx, 'update', 'Transaction.update');
                return callback(tx);
            }, ...rest);
        };
    }
    return sdk;
}
const firestoreContext = sandbox => vm.createContext(strictFirestore(sandbox));
module.exports = { assertFirestoreData, strictFirestore, firestoreContext };
