import { describe, expect, it } from "vitest";
import { resolveSemanticIndexWorkerConfig } from "../workers/semantic-indexer.js";
describe("semantic index worker config", () => {
    it("uses stable defaults when env vars are absent", () => {
        expect(resolveSemanticIndexWorkerConfig({})).toEqual({
            enabled: true,
            batchSize: 100,
            maxBatches: 10,
        });
    });
    it("clamps invalid env values back to safe defaults", () => {
        expect(resolveSemanticIndexWorkerConfig({
            SEMANTIC_INDEX_ENABLED: "1",
            SEMANTIC_INDEX_BATCH_SIZE: "0",
            SEMANTIC_INDEX_MAX_BATCHES: "-5",
        })).toEqual({
            enabled: true,
            batchSize: 100,
            maxBatches: 10,
        });
    });
    it("supports explicit disable and sane positive values", () => {
        expect(resolveSemanticIndexWorkerConfig({
            SEMANTIC_INDEX_ENABLED: "0",
            SEMANTIC_INDEX_BATCH_SIZE: "250",
            SEMANTIC_INDEX_MAX_BATCHES: "4",
        })).toEqual({
            enabled: false,
            batchSize: 250,
            maxBatches: 4,
        });
    });
});
//# sourceMappingURL=semantic-indexer.test.js.map