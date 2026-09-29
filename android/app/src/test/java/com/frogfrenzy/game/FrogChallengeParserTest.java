package com.frogfrenzy.game;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class FrogChallengeParserTest {
    private static final String TOKEN = "abcDEF_123456789xyz";

    @Test
    public void parsesVerifiedAppLinkPath() {
        assertEquals(TOKEN, FrogChallengeParser.tokenFromPath("/c/" + TOKEN));
        assertEquals("challenge", FrogChallengeParser.kindFromPath("/c/" + TOKEN));
        assertEquals(TOKEN, FrogChallengeParser.tokenFromPath("/r/" + TOKEN));
        assertEquals("room", FrogChallengeParser.kindFromPath("/r/" + TOKEN));
        assertEquals("", FrogChallengeParser.tokenFromPath("/shop/" + TOKEN));
    }

    @Test
    public void parsesPlainAndEncodedInstallReferrer() {
        assertEquals(TOKEN, FrogChallengeParser.tokenFromReferrer("utm_source=friend&challenge_token=" + TOKEN));
        assertEquals(TOKEN, FrogChallengeParser.tokenFromReferrer("utm_source%3Dfriend%26challenge_token%3D" + TOKEN));
        assertEquals(TOKEN, FrogChallengeParser.tokenFromReferrer("utm_source=friend&room_token=" + TOKEN));
        assertEquals("room", FrogChallengeParser.kindFromReferrer("room_token=" + TOKEN));
        assertEquals("challenge", FrogChallengeParser.kindFromReferrer("challenge_token=" + TOKEN));
        assertEquals("", FrogChallengeParser.tokenFromReferrer("challenge_token=too-short"));
    }
}
