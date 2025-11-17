// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MyPluginsCapacitorPrinter",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "MyPluginsCapacitorPrinter",
            targets: ["MyPrinterPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "MyPrinterPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/MyPrinterPlugin"),
        .testTarget(
            name: "MyPrinterPluginTests",
            dependencies: ["MyPrinterPlugin"],
            path: "ios/Tests/MyPrinterPluginTests")
    ]
)