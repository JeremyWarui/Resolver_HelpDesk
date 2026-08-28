"""
Reference data, not scoped: `org.views` decides who may read or write it.
Nothing here queries, and nothing here names a person.
"""

from rest_framework import serializers

from apps.org.models import Campus, ServiceItem, Trade


class CampusSerializer(serializers.ModelSerializer):
    """The campus itself. Who staffs it is a post, and
    `accounts.CampusRosterSerializer` is what reports that."""

    class Meta:
        model = Campus
        fields = ["id", "name", "code", "location"]


class ServiceItemSerializer(serializers.ModelSerializer):
    """Flat: `trade` is the id, since the tree nests these under it already."""

    class Meta:
        model = ServiceItem
        fields = ["id", "trade", "name", "is_active"]


class TradeSerializer(serializers.ModelSerializer):
    """Serves both admin CRUD and the ticket wizard."""

    items = ServiceItemSerializer(source="service_items", many=True, read_only=True)

    class Meta:
        model = Trade
        fields = ["id", "name", "code", "is_active", "items"]
