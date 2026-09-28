import XCTest
@testable import TikTokForWork

final class AppUpdateTests: XCTestCase {
    func testVersionsCompareByNumberNotByText() {
        XCTAssertTrue(AppUpdateService.isOlder("1.0", than: "1.0.1"))
        XCTAssertTrue(AppUpdateService.isOlder("1.0.9", than: "1.0.10"))
        XCTAssertTrue(AppUpdateService.isOlder("1.9", than: "1.10"))
        XCTAssertFalse(AppUpdateService.isOlder("1.0", than: "1.0.0"))
        XCTAssertFalse(AppUpdateService.isOlder("1.1", than: "1.0.5"))
        // A TestFlight build ahead of the store is never told to go back.
        XCTAssertFalse(AppUpdateService.isOlder("1.2.0", than: "1.1"))
    }
}
