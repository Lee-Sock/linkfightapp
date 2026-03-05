# Display and formatting utilities


def rx_color(rx_dbm: float) -> str:
    """Return color coding for signal strength.

    Color thresholds:
    - Green: >= -93 dBm (excellent signal)
    - Orange: -103 to -93 dBm (fair signal)
    - Red: < -103 dBm (poor signal)
    """
    if rx_dbm >= -93.0:
        return "green"  # Excellent: -93 dBm or better
    elif rx_dbm >= -103.0:
        return "orange"  # Fair: between -103 and -93 dBm
    else:
        return "red"  # Poor: worse than -103 dBm
