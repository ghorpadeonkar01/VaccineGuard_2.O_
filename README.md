# 🧊 ColdChain Watch

**Real-Time Cold Chain Integrity Monitoring for Vaccine Logistics**

A near-real-time IoT + software system that monitors vaccine shipments, detects temperature excursions, estimates remaining vaccine viability using thermal degradation models, and alerts the nearest downstream checkpoint before delivery — preventing "silent failures" in the cold chain.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10+-blue)
![Platform](https://img.shields.io/badge/platform-ESP32-orange)

---

## 📖 Table of Contents

- [Problem Statement](#-problem-statement)
- [Solution Overview](#-solution-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Hardware Requirements](#-hardware-requirements)
- [Software Setup](#-software-setup)
- [IoT Node Setup](#-iot-node-setup)
- [Running the System](#-running-the-system)
- [How It Works](#-how-it-works)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Datasets](#-datasets)
- [Demo Guide](#-demo-guide)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Problem Statement

Vaccines require an **unbroken cold chain** from manufacturer to clinic, typically maintained between **+2°C and +8°C**. A temperature excursion during transit can **silently spoil** a shipment — the vaccine looks fine but has lost potency. Current tracking systems often reveal the failure only **after delivery**, when the doses are already unusable.

**ColdChain Watch** solves this by:
1. Continuously monitoring temperature, humidity, and GPS from IoT sensor nodes
2. Detecting excursions in **near real-time** (< 5 seconds latency)
3. Estimating **remaining vaccine viability** using a thermal degradation model
4. **Predicting failure before delivery** and alerting the nearest checkpoint to intercept the shipment

---

## 💡 Solution Overview

The system has **three integrated layers**:
# Fusion2026_Cold_Chain
