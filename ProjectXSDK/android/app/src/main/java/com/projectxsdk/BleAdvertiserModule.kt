package com.projectxsdk

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.os.ParcelUuid
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.StandardCharsets
import java.util.UUID

class BleAdvertiserModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val bluetoothManager =
    reactContext.getSystemService(BluetoothManager::class.java)
  private var advertiseCallback: AdvertiseCallback? = null

  override fun getName() = "BleAdvertiser"

  @ReactMethod
  fun startAdvertising(serviceUuid: String, challenge: String, promise: Promise) {
    val adapter = bluetoothManager?.adapter
    val advertiser = adapter?.bluetoothLeAdvertiser
    if (adapter == null || advertiser == null || !adapter.isEnabled) {
      promise.reject("ble_unavailable", "Bluetooth LE advertising is unavailable")
      return
    }

    stopAdvertisingInternal()

    val callback = object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
        advertiseCallback = this
        promise.resolve(null)
      }

      override fun onStartFailure(errorCode: Int) {
        advertiseCallback = null
        promise.reject("ble_advertise_failed", "Advertising failed with code $errorCode")
      }
    }

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setConnectable(false)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .build()

    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .addServiceUuid(ParcelUuid(normalizeUuid(serviceUuid)))
      .addServiceData(
        ParcelUuid(normalizeUuid(serviceUuid)),
        challenge.toByteArray(StandardCharsets.UTF_8),
      )
      .build()

    advertiser.startAdvertising(settings, data, callback)
  }

  @ReactMethod
  fun stopAdvertising(promise: Promise) {
    stopAdvertisingInternal()
    promise.resolve(null)
  }

  private fun stopAdvertisingInternal() {
    val advertiser = bluetoothManager?.adapter?.bluetoothLeAdvertiser ?: return
    advertiseCallback?.let(advertiser::stopAdvertising)
    advertiseCallback = null
  }

  private fun normalizeUuid(value: String): UUID {
    return if (value.length == 4) {
      UUID.fromString("0000$value-0000-1000-8000-00805f9b34fb")
    } else {
      UUID.fromString(value)
    }
  }
}
