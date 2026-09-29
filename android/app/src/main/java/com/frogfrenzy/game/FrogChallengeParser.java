package com.frogfrenzy.game;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class FrogChallengeParser {
    private static final Pattern INVITE_PATH = Pattern.compile("/(c|r)/([A-Za-z0-9_-]{16,64})(?:/|$)");
    private static final Pattern INVITE_REFERRER = Pattern.compile("(?:^|&)(challenge_token|room_token)=([A-Za-z0-9_-]{16,64})(?:&|$)");

    private FrogChallengeParser() {
    }

    public static String tokenFromPath(String path) {
        Matcher matcher = INVITE_PATH.matcher(path == null ? "" : path);
        return matcher.find() ? matcher.group(2) : "";
    }

    public static String kindFromPath(String path) {
        Matcher matcher = INVITE_PATH.matcher(path == null ? "" : path);
        if (!matcher.find()) return "";
        return "r".equals(matcher.group(1)) ? "room" : "challenge";
    }

    public static String tokenFromReferrer(String raw) {
        if (raw == null) return "";
        String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
        Matcher matcher = INVITE_REFERRER.matcher(decoded);
        return matcher.find() ? matcher.group(2) : "";
    }

    public static String kindFromReferrer(String raw) {
        if (raw == null) return "";
        String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
        Matcher matcher = INVITE_REFERRER.matcher(decoded);
        if (!matcher.find()) return "";
        return "room_token".equals(matcher.group(1)) ? "room" : "challenge";
    }
}
