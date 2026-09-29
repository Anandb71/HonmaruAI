import XCTest
@testable import TikTokForWork

final class AppReadsTests: XCTestCase {
    func testAnAppIsNamedAsTheWebNamesIt() {
        XCTAssertEqual(AppReads.key(sourceApp: "routine"), "app:routine")
        XCTAssertEqual(AppReads.key(sourceApp: "Gmail"), "app:gmail")
        XCTAssertEqual(AppReads.key(sourceApp: "Your AI"), "app:ai")
        // A person's card is not an app's: it stays in the badge until decided.
        XCTAssertNil(AppReads.key(sourceApp: nil))
        XCTAssertNil(AppReads.key(sourceApp: " "))
    }

    @MainActor
    func testAPositionFromAnotherDeviceNeverMovesBack() {
        let reads = AppReads()
        reads.merge(["app:routine": "2026-09-29T08:00:00Z", "b:cafe": "2026-09-29T09:00:00Z"])
        reads.merge(["app:routine": "2026-09-28T08:00:00Z"])
        XCTAssertEqual(reads.at["app:routine"], ChatDates.parse("2026-09-29T08:00:00Z"))
        XCTAssertNil(reads.at["b:cafe"])
    }
}
