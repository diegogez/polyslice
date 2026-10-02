package com.polyslice.test;

import com.polyslice.json.Json;
import com.polyslice.json.JsonWriter;
import com.polyslice.test.TestRunner.Test;

import java.util.List;
import java.util.Map;

import static com.polyslice.test.TestRunner.assertEquals;
import static com.polyslice.test.TestRunner.assertTrue;

public class JsonTest {

    @Test
    public void parsesCommand() {
        Map<String, Object> m = Json.parseObject("{\"cmd\":\"blade\",\"x\":12.5,\"y\":-3e2,\"down\":true,\"n\":null}");
        assertEquals("blade", m.get("cmd"), "string field");
        assertEquals(12.5, m.get("x"), "decimal");
        assertEquals(-300.0, m.get("y"), "exponent");
        assertEquals(Boolean.TRUE, m.get("down"), "boolean");
        assertTrue(m.containsKey("n") && m.get("n") == null, "null value");
    }

    @Test
    public void parsesNestedStructuresAndEscapes() {
        Map<String, Object> m = Json.parseObject("{\"a\":[1,[2,3],{\"b\":\"q\\\"\\n\\u0041\"}]}");
        List<?> a = (List<?>) m.get("a");
        assertEquals(3, a.size(), "array length");
        assertEquals("q\"\nA", ((Map<?, ?>) a.get(2)).get("b"), "escapes decoded");
    }

    @Test
    public void rejectsGarbage() {
        boolean threw = false;
        try {
            Json.parse("{\"a\":}");
        } catch (Json.JsonException e) {
            threw = true;
        }
        assertTrue(threw, "invalid JSON should throw");
    }

    @Test
    public void writerInsertsCommasAndRoundsNumbers() {
        JsonWriter w = new JsonWriter();
        w.beginObject().field("a", 1).field("b", 2.456, 1).key("c").beginArray().value("x").value(3.0).endArray()
                .field("d", -0.04, 1).endObject();
        assertEquals("{\"a\":1,\"b\":2.5,\"c\":[\"x\",3],\"d\":0}", w.toString(), "compact output");
    }

    @Test
    public void writerPadsSmallFractions() {
        JsonWriter w = new JsonWriter();
        w.beginArray().value(1.05, 2).value(-7.5, 2).value(Double.NaN).endArray();
        assertEquals("[1.05,-7.5,0]", w.toString(), "leading zero kept, NaN sanitized");
    }

    @Test
    public void writerOutputRoundTripsThroughParser() {
        JsonWriter w = new JsonWriter();
        w.beginObject().field("name", "Tab\there \"quoted\"").field("n", 42).endObject();
        Map<String, Object> back = Json.parseObject(w.toString());
        assertEquals("Tab\there \"quoted\"", back.get("name"), "string survives");
        assertEquals(42.0, back.get("n"), "number survives");
    }
}
