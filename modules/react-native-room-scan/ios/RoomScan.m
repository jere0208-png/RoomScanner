#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(RoomScanModule, NSObject)
RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startRoomScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopRoomScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(pauseRoomScan)
RCT_EXTERN_METHOD(resumeRoomScan)
RCT_EXTERN_METHOD(cameraStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestCamera:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setTorch:(BOOL)on resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanEvents, RCTEventEmitter)
@end

@interface RCT_EXTERN_MODULE(RoomScanPreview, NSObject)
RCT_EXTERN_METHOD(presentUSDZ:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanExport, NSObject)
RCT_EXTERN_METHOD(sharePDF:(NSString *)base64
                  filename:(NSString *)filename
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(shareText:(NSString *)content
                  filename:(NSString *)filename
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(shareFile:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanViewManager, RCTViewManager)
@end
